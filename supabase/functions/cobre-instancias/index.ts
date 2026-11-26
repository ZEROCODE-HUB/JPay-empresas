// Edge Function: instancias Cobre y suscripciones de avisos (Solution Design §3.0 y
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
//
// Conexión en un paso de la cuenta Cobre de un cliente (admin › cliente › Conexiones). Solo la
// hace un administrador: el cliente no carga claves ni ve el nombre del proveedor en el portal.
// - `conexion_cliente` { legajo }: estado de la cuenta conectada (sin secretos).
// - `conectar_cliente` { legajo, user_id, secret }: valida las claves contra Cobre, guarda la
//   instancia (el secret y una clave de avisos generada aquí van a Vault), vincula su Cobre
//   Balance México (usa el que ya tenga, el de mayor saldo, o lo crea) y suscribe los avisos. Los
//   dos últimos pasos son best-effort: si fallan, la cuenta queda conectada y se informa qué
//   faltó (se reintenta conectando de nuevo).
// - `desconectar_cliente` { legajo }: quita los avisos, desactiva la instancia y deshabilita su
//   CLABE en JPay.
// - `balances_usd` { legajo, global?, usa? }: dólares en la cuenta propia (§4.1 pasos 5–6). Vincula
//   los Balances Global (`pr_global_cobre`) y USA (`pr_usa_cobre`) del cliente: el `acc_…` que se
//   indique, el que ya tenga en Cobre o, si no tiene, lo crea. Al conectar se vinculan solos los
//   que ya existan (nunca se crean sin pedirlo).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { CobreError, modoCobre } from "../_shared/cobre.ts";
import {
  claveWebhookCobre,
  conexionCobre,
  EVENTOS_COBRE,
  instanciaCobre,
  urlWebhookCobre,
} from "../_shared/cobre-servidor.ts";
import { asignarClabeReceptora } from "../_shared/cobre-subclientes.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";
import { brand } from "../_shared/brand.ts";

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
        case "conexion_cliente":
          return json(await conexionDeCliente(sb, await legajoExistente(sb, body.legajo)));
        case "conectar_cliente":
          return json(await conectar(sb, await legajoExistente(sb, body.legajo), body));
        case "desconectar_cliente":
          return json(await desconectar(sb, await legajoExistente(sb, body.legajo)));
        case "balances_usd": {
          const legajo = await legajoExistente(sb, body.legajo);
          await balancesUsdCliente(sb, legajo, {
            global: texto(body.global, 60),
            usa: texto(body.usa, 60),
            crear: true,
          });
          return json(await conexionDeCliente(sb, legajo));
        }
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
        throw new HttpError(
          e.status >= 400 && e.status < 500 ? 422 : 502,
          `No se pudo completar la operación: ${e.message}`,
        );
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
      // Siempre los 3 argumentos (null = no cambiar): si se omite uno, PostgREST no encuentra la función.
      p_secret: (secret ?? null) as string,
      p_clave_webhook: (clave ?? null) as string,
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
    ? await conexion.cliente.get<Cuenta>(`/accounts/${cuentaExterna}`, { sensitive_data: true })
    : await conexion.cliente.post<Cuenta>("/accounts", {
        provider_id: "pr_mex_cobre3",
        action: "create",
        tags: [`jpay-${inst.clienteLegajo}`],
        alias: `${brand.name.toUpperCase()} ${inst.clienteLegajo}`.slice(0, 32),
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
  const { data: existente } = await sb
    .from("cobre_cuentas")
    .select("id, cliente_legajo")
    .eq("modo", conexion.modo)
    .eq("cuenta_externa_id", cuenta.id)
    .maybeSingle();
  if (existente && existente.cliente_legajo !== inst.clienteLegajo) {
    throw new HttpError(409, "Esa cuenta de Cobre ya está vinculada a otro cliente");
  }
  await sb
    .from("cobre_cuentas")
    .update({ estado: "cerrada" })
    .eq("tipo", "cliente")
    .eq("cliente_legajo", inst.clienteLegajo)
    .eq("modo", conexion.modo)
    .eq("estado", "activa")
    .neq("cuenta_externa_id", cuenta.id);
  // Upsert: al reconectar la misma cuenta de Cobre se reusa su fila (único por modo + id externo).
  const { data: fila, error } = await sb
    .from("cobre_cuentas")
    .upsert(
      {
        estado: "activa",
        tipo: "cliente",
        cliente_legajo: inst.clienteLegajo,
        modo: conexion.modo,
        cuenta_externa_id: cuenta.id,
        clabe,
        alias: `${brand.name.toUpperCase()} ${inst.clienteLegajo}`.slice(0, 32),
        instancia_id: inst.id,
        subcuenta_id: receptora?.id ?? null,
        conectividad: cuenta.connectivity?.status ?? null,
      },
      { onConflict: "modo,cuenta_externa_id" },
    )
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
      description: inst ? `${brand.name} ${inst.clienteLegajo}` : `${brand.name}`,
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

// ── Conexión en un paso de la cuenta Cobre de un cliente ────────────────────

/** Legajo pedido por el admin, comprobando que el cliente exista. */
async function legajoExistente(sb: SupabaseClient, pedido: unknown): Promise<string> {
  const legajo = texto(pedido, 40);
  if (!legajo) throw new HttpError(400, "Falta el legajo del cliente");
  const { data, error } = await sb
    .from("clientes")
    .select("legajo")
    .eq("legajo", legajo)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Cliente inexistente");
  return data.legajo as string;
}

const mensaje = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^No se pudo completar la operación: /, "") : String(e);

type InstanciaFila = {
  id: string;
  user_id: string;
  suscripcion_id: string | null;
  created_at: string;
};

async function instanciaActiva(sb: SupabaseClient, legajo: string): Promise<InstanciaFila | null> {
  const { data, error } = await sb
    .from("cobre_instancias")
    .select("id, user_id, suscripcion_id, created_at")
    .eq("cliente_legajo", legajo)
    .eq("modo", modoCobre())
    .eq("estado", "activa")
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data as InstanciaFila | null;
}

async function conexionDeCliente(sb: SupabaseClient, legajo: string) {
  const modo = modoCobre();
  const inst = await instanciaActiva(sb, legajo);
  if (!inst) return { conectada: false, modo };
  const { data: cuentas } = await sb
    .from("cobre_cuentas")
    .select("tipo, cuenta_externa_id, clabe, conectividad")
    .eq("instancia_id", inst.id)
    .eq("estado", "activa");
  const filas = (cuentas ?? []) as {
    tipo: string;
    cuenta_externa_id: string;
    clabe: string | null;
    conectividad: string | null;
  }[];
  const cuenta = filas.find((c) => c.tipo === "cliente");
  const global = filas.find((c) => c.tipo === "global")?.cuenta_externa_id ?? null;
  const usa = filas.find((c) => c.tipo === "usa")?.cuenta_externa_id ?? null;
  return {
    conectada: true,
    modo,
    user_id: inst.user_id,
    avisos: !!inst.suscripcion_id,
    conectada_at: inst.created_at,
    cuenta: cuenta
      ? {
          cuenta_externa_id: cuenta.cuenta_externa_id,
          clabe: cuenta.clabe,
          conectividad: cuenta.conectividad,
        }
      : null,
    dolares: { global, usa },
  };
}

/** Cobre Balance México que ya tenga la cuenta del cliente (prefiere uno con CLABE). */
async function balanceExistente(sb: SupabaseClient, id: string): Promise<string | null> {
  const inst = await instanciaCobre(sb, id);
  if (!inst) return null;
  const r = await conexionCobre(sb, inst)
    .cliente.get<{ contents?: Obj[] }>("/accounts", { page_size: 100, sensitive_data: true })
    .catch(() => null);
  // Cobre enmascara la CLABE si no se pide sensitive_data. Entre varias, la de mayor saldo.
  const mx = (r?.contents ?? [])
    .filter((a) => a.provider_id === "pr_mex_cobre3")
    .sort((x, y) => Number(y.obtained_balance ?? 0) - Number(x.obtained_balance ?? 0));
  const c = mx.find((a) => /^\d{18}$/.test(String(a.account_number ?? ""))) ?? mx[0];
  return c ? String(c.id) : null;
}

async function conectar(sb: SupabaseClient, legajo: string, b: Obj) {
  const userId = texto(b.user_id, 120);
  const secret = texto(b.secret, 500);
  if (!userId || !secret) {
    throw new HttpError(400, "Faltan el User ID y la clave secreta de Cobre");
  }
  // 1. Que Cobre acepte las claves antes de guardar nada.
  const prueba = conexionCobre(sb, {
    id: "validacion",
    clienteLegajo: legajo,
    baseUrl: null,
    credenciales: { userId, secret },
    claveWebhook: null,
  });
  try {
    await prueba.cliente.token(true);
  } catch (e) {
    throw new HttpError(422, `Cobre no aceptó las claves: ${mensaje(e)}`);
  }
  // 2. Guardar la instancia. La clave de avisos se genera aquí y nunca sale del servidor; al
  //    reconectar se conserva la que ya firma la suscripción existente.
  const previa = await instanciaActiva(sb, legajo);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const clave = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
  const { id } = await guardar(sb, {
    legajo,
    user_id: userId,
    secret,
    ...(previa?.suscripcion_id ? {} : { clave_webhook: clave }),
  });
  // 3. Su cuenta en pesos (CLABE) y 4. los avisos de movimientos.
  const faltantes: string[] = [];
  try {
    await vincularBalance(sb, id, await balanceExistente(sb, id));
  } catch (e) {
    faltantes.push(`Cuenta en pesos (CLABE): ${mensaje(e)}`);
  }
  try {
    await suscribir(sb, id);
  } catch (e) {
    faltantes.push(`Avisos de movimientos: ${mensaje(e)}`);
  }
  // Dólares: solo si la cuenta ya tiene sus Balances Global y USA (no se crean al conectar).
  await balancesUsdCliente(sb, legajo, { global: null, usa: null, crear: false }).catch(() => null);
  return { ...(await conexionDeCliente(sb, legajo)), faltantes };
}

type CuentaUsd = { id: string; provider_id?: string; connectivity?: { status?: string } };
const PROVEEDOR_USD = { global: "pr_global_cobre", usa: "pr_usa_cobre" } as const;

/**
 * Balances Global y USA de la cuenta propia del cliente. Por cada uno: el `acc_…` indicado (se
 * valida en Cobre), el que ya tenga la cuenta o, con `crear`, uno nuevo.
 */
async function balancesUsdCliente(
  sb: SupabaseClient,
  legajo: string,
  o: { global: string | null; usa: string | null; crear: boolean },
) {
  const previa = await instanciaActiva(sb, legajo);
  if (!previa) throw new HttpError(409, "El cliente no tiene su cuenta de Cobre conectada");
  const inst = await instanciaCobre(sb, previa.id);
  if (!inst) throw new HttpError(409, "La cuenta de Cobre del cliente no está activa");
  const conexion = conexionCobre(sb, inst);
  const lista = await conexion.cliente
    .get<{ contents?: CuentaUsd[] }>("/accounts", { page_size: 100 })
    .catch(() => null);
  for (const tipo of ["global", "usa"] as const) {
    const { data: actual } = await sb
      .from("cobre_cuentas")
      .select("cuenta_externa_id")
      .eq("modo", conexion.modo)
      .eq("instancia_id", inst.id)
      .eq("tipo", tipo)
      .eq("estado", "activa")
      .maybeSingle();
    const pedido = o[tipo];
    if (actual && (!pedido || pedido === actual.cuenta_externa_id)) continue;
    let cuenta: CuentaUsd | null = null;
    if (pedido) {
      if (!/^acc_[\w-]+$/.test(pedido))
        throw new HttpError(400, `ID de cuenta inválido: ${pedido}`);
      cuenta = await conexion.cliente.get<CuentaUsd>(`/accounts/${pedido}`);
    } else {
      cuenta = (lista?.contents ?? []).find((a) => a.provider_id === PROVEEDOR_USD[tipo]) ?? null;
      if (!cuenta && o.crear) {
        cuenta = await conexion.cliente.post<CuentaUsd>(
          "/accounts",
          tipo === "global"
            ? {
                provider_id: "pr_global_cobre",
                action: "create",
                metadata: { currency: "usd" },
                tags: [`jpay-${legajo}`],
                alias: `${brand.name.toUpperCase()} ${legajo} USD`.slice(0, 32),
              }
            : {
                provider_id: "pr_usa_cobre",
                action: "create",
                metadata: {},
                tags: [`jpay-${legajo}`],
                alias: `${brand.name.toUpperCase()} ${legajo} USA`.slice(0, 32),
              },
        );
      }
    }
    if (!cuenta) continue;
    if (cuenta.provider_id && cuenta.provider_id !== PROVEEDOR_USD[tipo]) {
      throw new HttpError(
        409,
        `${cuenta.id} no es un Balance ${tipo === "global" ? "Global" : "USA"} (${cuenta.provider_id})`,
      );
    }
    const { data: otra } = await sb
      .from("cobre_cuentas")
      .select("instancia_id")
      .eq("modo", conexion.modo)
      .eq("cuenta_externa_id", cuenta.id)
      .maybeSingle();
    if (otra && otra.instancia_id !== inst.id) {
      throw new HttpError(409, "Esa cuenta de Cobre ya está vinculada a otra conexión");
    }
    await sb
      .from("cobre_cuentas")
      .update({ estado: "cerrada" })
      .eq("modo", conexion.modo)
      .eq("instancia_id", inst.id)
      .eq("tipo", tipo)
      .eq("estado", "activa");
    const { error } = await sb.from("cobre_cuentas").upsert(
      {
        estado: "activa",
        tipo,
        modo: conexion.modo,
        cuenta_externa_id: cuenta.id,
        clabe: null,
        alias: `${legajo} ${tipo === "global" ? "Global USD" : "USA"}`.slice(0, 32),
        proveedor_id: PROVEEDOR_USD[tipo],
        moneda: "USD",
        instancia_id: inst.id,
        conectividad: cuenta.connectivity?.status ?? null,
      },
      { onConflict: "modo,cuenta_externa_id" },
    );
    if (error) throw new HttpError(500, error.message);
  }
}

async function desconectar(sb: SupabaseClient, legajo: string) {
  const previa = await instanciaActiva(sb, legajo);
  if (!previa) return { conectada: false, modo: modoCobre() };
  // Quita la suscripción de avisos en Cobre (best-effort: las claves pueden ya no servir).
  const inst = await instanciaCobre(sb, previa.id).catch(() => null);
  if (inst && previa.suscripcion_id) {
    await conexionCobre(sb, inst)
      .cliente.request("DELETE", `/subscriptions/${previa.suscripcion_id}`)
      .catch(() => null);
  }
  const ahora = new Date().toISOString();
  const { data: cuentas } = await sb
    .from("cobre_cuentas")
    .update({ estado: "cerrada" })
    .eq("instancia_id", previa.id)
    .eq("estado", "activa")
    .select("id");
  for (const c of (cuentas ?? []) as { id: string }[]) {
    const { data: clabes } = await sb
      .from("cobre_clabes")
      .update({ estado: "deshabilitada", deshabilitada_at: ahora })
      .eq("cuenta_id", c.id)
      .eq("estado", "activa")
      .select("subcuenta_id, clabe");
    for (const k of (clabes ?? []) as { subcuenta_id: string; clabe: string }[]) {
      await sb
        .from("subaccounts")
        .update({ cbu: null })
        .eq("id", k.subcuenta_id)
        .eq("cbu", k.clabe);
    }
  }
  await sb.from("cobre_suscripciones").delete().eq("instancia_id", previa.id);
  await desactivar(sb, previa.id);
  return { conectada: false, modo: modoCobre() };
}
