// Edge Function (solo admins): instancias Cobre y suscripciones de avisos (Solution Design §3.0 y
// §4.1, paso 8). Body: { accion, … }.
//
// - `guardar` { legajo, user_id, secret?, clave_webhook?, base_url? }: alta o cambio de la
//   instancia Cobre propia de un comercio (excepción: contrato directo con Cobre). El `secret` y
//   la `event_signature_key` van a Vault; nunca se devuelven.
// - `desactivar` { instancia_id }: el comercio vuelve a operar con la instancia matriz.
// - `vincular_balance` { instancia_id, cuenta_externa_id? }: Cobre Balance México del comercio en
//   su instancia: lo valida si ya existe (`acc_…`) o lo crea; su CLABE va a la subcuenta receptora.
// - `suscribir` { instancia_id? }: registra la suscripción de avisos (`POST /subscriptions`) con
//   todos los eventos del documento, en la matriz (sin instancia) o en la del comercio, con su
//   URL (`cobre-webhook?instancia=<id>`) y su clave. Si ya existe una con esa URL, la reusa.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { CobreError } from "../_shared/cobre.ts";
import {
  claveWebhookCobre,
  conexionCobre,
  EVENTOS_COBRE,
  instanciaCobre,
  urlWebhookCobre,
} from "../_shared/cobre-servidor.ts";
import { asignarClabeReceptora } from "../_shared/cobre-subclientes.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

type Obj = Record<string, unknown>;
const texto = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

Deno.serve(
  handler(async (req) => {
    if (!(await esAdmin(req))) throw new HttpError(403, "Solo para administradores");
    const body = await readJson<Obj>(req);
    const sb = serviceClient();
    try {
      switch (body.accion) {
        case "guardar":
          return json(await guardar(sb, body));
        case "desactivar":
          return json(await desactivar(sb, String(body.instancia_id ?? "")));
        case "vincular_balance":
          return json(
            await vincularBalance(
              sb,
              String(body.instancia_id ?? ""),
              texto(body.cuenta_externa_id, 60),
            ),
          );
        case "suscribir":
          return json(await suscribir(sb, texto(body.instancia_id, 36)));
        default:
          throw new HttpError(400, "Acción inválida");
      }
    } catch (e) {
      if (e instanceof CobreError) {
        throw new HttpError(e.status >= 400 && e.status < 500 ? 422 : 502, `Cobre: ${e.message}`);
      }
      throw e;
    }
  }),
);

async function guardar(sb: SupabaseClient, b: Obj) {
  const legajo = texto(b.legajo, 40);
  const userId = texto(b.user_id, 120);
  if (!legajo || !userId) throw new HttpError(400, "Faltan el legajo o el user_id");
  const baseUrl = texto(b.base_url, 200);
  if (baseUrl && !/^https:\/\//.test(baseUrl))
    throw new HttpError(400, "La URL de la instancia debe ser https");
  const modo = conexionCobre(sb).modo;
  const { data: previa } = await sb
    .from("cobre_instancias")
    .select("id")
    .eq("cliente_legajo", legajo)
    .eq("modo", modo)
    .eq("estado", "activa")
    .maybeSingle();
  let id = previa?.id as string | undefined;
  if (id) {
    await sb.from("cobre_instancias").update({ user_id: userId, base_url: baseUrl }).eq("id", id);
  } else {
    const { data, error } = await sb
      .from("cobre_instancias")
      .insert({ cliente_legajo: legajo, modo, user_id: userId, base_url: baseUrl })
      .select("id")
      .single();
    if (error) throw new HttpError(409, error.message);
    id = data.id;
  }
  const secret = texto(b.secret, 500);
  const clave = texto(b.clave_webhook, 500);
  if (!previa && !secret) throw new HttpError(400, "Falta el secret de la instancia");
  if (secret || clave) {
    const { error } = await sb.rpc("cobre_instancia_guardar_secretos", {
      p_instancia_id: id,
      p_secret: secret ?? undefined,
      p_clave_webhook: clave ?? undefined,
    });
    if (error) throw new HttpError(500, error.message);
  }
  // Prueba la conexión con las credenciales nuevas (token).
  const inst = await instanciaCobre(sb, id!);
  if (inst) await conexionCobre(sb, inst).cliente.token(true);
  const { data } = await sb
    .from("cobre_instancias")
    .select(
      "id, cliente_legajo, modo, user_id, base_url, estado, suscripcion_id, created_at, updated_at",
    )
    .eq("id", id)
    .single();
  return { ...data, conectada: true, url_avisos: urlWebhookCobre(id) };
}

async function desactivar(sb: SupabaseClient, id: string) {
  const { data, error } = await sb
    .from("cobre_instancias")
    .update({ estado: "inactiva", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, estado")
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Instancia inexistente");
  return data;
}

async function vincularBalance(sb: SupabaseClient, id: string, cuentaExterna: string | null) {
  const inst = await instanciaCobre(sb, id);
  if (!inst) throw new HttpError(404, "Instancia inexistente o inactiva");
  const conexion = conexionCobre(sb, inst);
  type Cuenta = {
    id: string;
    account_number?: string | null;
    connectivity?: { status?: string };
    provider_id?: string;
  };
  const cuenta = cuentaExterna
    ? await conexion.cliente.get<Cuenta>(`/accounts/${cuentaExterna}`)
    : await conexion.cliente.post<Cuenta>("/accounts", {
        provider_id: "pr_mex_cobre3",
        action: "create",
        tags: [`jpay-${inst.clienteLegajo}`],
        alias: `JPAY ${inst.clienteLegajo}`.slice(0, 32),
      });
  if (cuenta.provider_id && cuenta.provider_id !== "pr_mex_cobre3") {
    throw new HttpError(409, "La cuenta no es un Cobre Balance México");
  }
  const clabe = /^\d{18}$/.test(cuenta.account_number ?? "") ? cuenta.account_number! : null;
  const { data: subs } = await sb
    .from("subaccounts")
    .select("id, moneda")
    .eq("cliente_legajo", inst.clienteLegajo)
    .eq("estado", "Activa")
    .order("created_at");
  const receptora = ((subs ?? []) as { id: string; moneda: string | null }[]).find(
    (s) => !s.moneda || s.moneda === "MXN",
  );
  await sb
    .from("cobre_cuentas")
    .update({ estado: "cerrada" })
    .eq("tipo", "cliente")
    .eq("cliente_legajo", inst.clienteLegajo)
    .eq("modo", conexion.modo)
    .eq("estado", "activa");
  const { data: fila, error } = await sb
    .from("cobre_cuentas")
    .insert({
      tipo: "cliente",
      cliente_legajo: inst.clienteLegajo,
      modo: conexion.modo,
      cuenta_externa_id: cuenta.id,
      clabe,
      alias: `JPAY ${inst.clienteLegajo}`.slice(0, 32),
      instancia_id: inst.id,
      subcuenta_id: receptora?.id ?? null,
      conectividad: cuenta.connectivity?.status ?? null,
    })
    .select("id, cuenta_externa_id, clabe, conectividad")
    .single();
  if (error) throw new HttpError(500, error.message);
  if (clabe && receptora) {
    await asignarClabeReceptora(
      sb,
      conexion.modo,
      fila.id,
      receptora.id,
      inst.clienteLegajo,
      clabe,
    );
  }
  return fila;
}

async function suscribir(sb: SupabaseClient, instanciaId: string | null) {
  const inst = instanciaId ? await instanciaCobre(sb, instanciaId) : null;
  if (instanciaId && !inst) throw new HttpError(404, "Instancia inexistente o inactiva");
  const conexion = conexionCobre(sb, inst);
  const url = urlWebhookCobre(inst?.id ?? null);
  const clave = await claveWebhookCobre(conexion.modo, inst);
  if (!clave) {
    throw new HttpError(
      409,
      inst
        ? "La instancia no tiene clave de avisos cargada"
        : "Falta COBRE_WEBHOOK_KEY en los secretos",
    );
  }
  const lista = await conexion.cliente.get<{ contents?: Obj[] }>("/subscriptions", {
    page_size: 100,
  });
  let sub = (lista?.contents ?? []).find((s) => s.url === url) ?? null;
  if (!sub) {
    sub = await conexion.cliente.post<Obj>("/subscriptions", {
      url,
      description: inst ? `JPay ${inst.clienteLegajo}` : "JPay",
      events: EVENTOS_COBRE,
      event_signature_key: clave,
    });
  }
  const externo = String(sub.id ?? "");
  const eventos = Array.isArray(sub.events) ? (sub.events as string[]) : EVENTOS_COBRE;
  // Una suscripción por instancia (el índice único usa coalesce(instancia_id)): se reemplaza.
  let borrar = sb.from("cobre_suscripciones").delete().eq("modo", conexion.modo);
  borrar = inst ? borrar.eq("instancia_id", inst.id) : borrar.is("instancia_id", null);
  await borrar;
  const { error } = await sb.from("cobre_suscripciones").insert({
    modo: conexion.modo,
    instancia_id: inst?.id ?? null,
    suscripcion_externa_id: externo,
    url,
    eventos,
  });
  if (error) throw new HttpError(500, error.message);
  if (inst) await sb.from("cobre_instancias").update({ suscripcion_id: externo }).eq("id", inst.id);
  const faltan = EVENTOS_COBRE.filter((e) => !eventos.includes(e));
  return { suscripcion: externo, url, eventos: eventos.length, faltan };
}
