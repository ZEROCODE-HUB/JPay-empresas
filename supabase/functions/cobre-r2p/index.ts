// Edge Function: cobros Direct Link R2P SPEI con Cobre (Solution Design §4.2). Body: { accion, … }.
//
// Comercio (su sesión):
// - `crear` { monto, concepto?, pagador: { nombre, id_tipo, id_numero, correo? }, minutos?,
//   subcuenta_id? }: emite el cobro y devuelve la CLABE dinámica y su vencimiento.
// - `consultar` { cobro_id }: trae el estado de Cobre y lo aplica.
// Checkout público del link (/p/$code, anon key):
// - `info` { code }: si el comercio del link puede cobrar por SPEI con Cobre.
// - `checkout` { code, idempotency_key, monto?, pagador }: crea el pago del link (proveedor
//   `cobre`) y el cobro; devuelve CLABE y vencimiento. Mismo intento → mismo cobro.
// - `estado` { pago_id }: estado del pago (lo cambian los avisos de Cobre, nunca el navegador).
// El dinero entra al Cobre Balance del comercio y se acredita en su subcuenta al llegar el crédito
// `r2p_spei_credit` (aviso o conciliación).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { CobreError } from "../_shared/cobre.ts";
import { conexionDeCliente, type ConexionCobre } from "../_shared/cobre-servidor.ts";
import { aplicarEstadoCobroR2p, emitirCobroR2p, nuevoExternalR2p } from "../_shared/cobre-r2p.ts";
import { handler, HttpError, json, readJson, serviceClient, userClient } from "../_shared/http.ts";

type Obj = Record<string, unknown>;
const MIN_MINUTOS = 5;
const MAX_MINUTOS = 60 * 24 * 3;

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Obj>(req);
    const sb = serviceClient();
    try {
      switch (body.accion) {
        case "info":
          return json(await info(sb, body.code));
        case "checkout":
          return json(await checkout(sb, body));
        case "estado":
          return json(await estadoPago(sb, body.pago_id));
        case "crear": {
          const legajo = await legajoDeSesion(req);
          return json(await crear(sb, legajo, body, null));
        }
        case "consultar": {
          const legajo = await legajoDeSesion(req);
          return json(await consultar(sb, legajo, String(body.cobro_id ?? "")));
        }
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

async function legajoDeSesion(req: Request): Promise<string> {
  const { data, error } = await userClient(req).rpc("current_cliente_legajo");
  if (error || typeof data !== "string" || !data) throw new HttpError(403, "Cliente no encontrado");
  return data;
}

/** Balance del comercio y subcuenta que recibe el cobro. */
async function destino(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  legajo: string,
  subcuentaId: unknown,
) {
  const { data: cuenta } = await sb
    .from("cobre_cuentas")
    .select("cuenta_externa_id, subcuenta_id, conectividad")
    .eq("tipo", "cliente")
    .eq("cliente_legajo", legajo)
    .eq("modo", conexion.modo)
    .eq("estado", "activa")
    .maybeSingle();
  if (!cuenta || (cuenta.conectividad && cuenta.conectividad !== "connected")) return null;
  let sub = cuenta.subcuenta_id as string | null;
  if (typeof subcuentaId === "string" && subcuentaId) {
    const { data: s } = await sb
      .from("subaccounts")
      .select("id, moneda, estado")
      .eq("id", subcuentaId)
      .eq("cliente_legajo", legajo)
      .maybeSingle();
    if (!s || s.estado !== "Activa" || (s.moneda && s.moneda !== "MXN")) {
      throw new HttpError(400, "La subcuenta debe ser una subcuenta activa en pesos");
    }
    sub = s.id;
  }
  if (!sub) return null;
  return { cuenta: cuenta.cuenta_externa_id as string, subcuentaId: sub };
}

function pagadorValido(p: unknown) {
  const x = (p ?? {}) as Obj;
  const nombre = String(x.nombre ?? "")
    .trim()
    .slice(0, 120);
  const idNumero = String(x.id_numero ?? "")
    .trim()
    .toUpperCase();
  const correo = String(x.correo ?? x.email ?? "")
    .trim()
    .slice(0, 200);
  if (!nombre) throw new HttpError(400, "Falta el nombre del pagador");
  if (!/^[A-Z0-9&Ñ]{10,18}$/.test(idNumero))
    throw new HttpError(400, "RFC o CURP del pagador inválido");
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo))
    throw new HttpError(400, "Correo inválido");
  return {
    nombre,
    idTipo: idNumero.length === 18 ? "curp" : "rfc",
    idNumero,
    correo: correo || null,
  };
}

async function crear(
  sb: SupabaseClient,
  legajo: string,
  b: Obj,
  vinculo: { linkId: string; pagoId: string } | null,
) {
  const monto = Math.round(Number(b.monto) * 100) / 100;
  if (!(monto > 0)) throw new HttpError(400, "Monto inválido");
  const minutos = Math.min(Math.max(Number(b.minutos) || 60, MIN_MINUTOS), MAX_MINUTOS);
  const pagador = pagadorValido(b.pagador);
  const conexion = await conexionDeCliente(sb, legajo);
  const d = await destino(sb, conexion, legajo, b.subcuenta_id);
  if (!d) throw new HttpError(409, "La cuenta del comercio en Cobre todavía no está habilitada");
  const externo = nuevoExternalR2p();
  const { data: fila, error } = await sb
    .from("cobre_cobros_r2p")
    .insert({
      modo: conexion.modo,
      cliente_legajo: legajo,
      subcuenta_id: d.subcuentaId,
      link_id: vinculo?.linkId ?? null,
      pago_id: vinculo?.pagoId ?? null,
      external_id: externo,
      cuenta_destino_externa_id: d.cuenta,
      monto,
      concepto:
        String(b.concepto ?? "")
          .trim()
          .slice(0, 120) || "Cobro JPay",
      pagador_nombre: pagador.nombre,
      pagador_id_tipo: pagador.idTipo,
      pagador_id_numero: pagador.idNumero,
      pagador_correo: pagador.correo,
      valido_hasta: new Date(Date.now() + minutos * 60_000).toISOString(),
      instancia_id: conexion.instanciaId,
    })
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  try {
    return await emitirCobroR2p(sb, conexion, fila);
  } catch (e) {
    // Sin respuesta clara: queda `creando` y la revisión de pendientes reenvía con la misma clave.
    if (e instanceof CobreError && (e.status >= 500 || e.status === 408 || e.status === 429)) {
      return { ...fila, aviso: "Cobre no respondió; la CLABE se genera en unos minutos" };
    }
    throw e;
  }
}

async function consultar(sb: SupabaseClient, legajo: string, id: string) {
  const { data: fila } = await sb
    .from("cobre_cobros_r2p")
    .select("*")
    .eq("id", id)
    .eq("cliente_legajo", legajo)
    .maybeSingle();
  if (!fila) throw new HttpError(404, "Cobro inexistente");
  if (fila.mm_id && ["pendiente", "creando"].includes(fila.estado)) {
    const conexion = await conexionDeCliente(sb, legajo);
    await aplicarEstadoCobroR2p(
      sb,
      conexion.modo,
      await conexion.cliente.get(`/money_movements/${fila.mm_id}`),
    );
  }
  const { data } = await sb.from("cobre_cobros_r2p").select("*").eq("id", fila.id).single();
  return data;
}

// ── Checkout del link de pago ────────────────────────────────────────────────

type Link = {
  id: string;
  estado: string;
  monto: number;
  pagos_parciales: boolean;
  expira_en: string | null;
  cliente_legajo: string;
  referencia: string | null;
};

async function linkPorCodigo(sb: SupabaseClient, code: unknown): Promise<Link> {
  if (typeof code !== "string" || !code.trim()) throw new HttpError(400, "Falta el código");
  const { data, error } = await sb.rpc("obtener_link_pago", { p_codigo: code.trim() });
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Link de pago inexistente");
  return data as Link;
}

const vigente = (l: Link) =>
  l.estado !== "Inactivo" && (!l.expira_en || new Date(l.expira_en).getTime() > Date.now());

async function info(sb: SupabaseClient, code: unknown) {
  const link = await linkPorCodigo(sb, code);
  const conexion = await conexionDeCliente(sb, link.cliente_legajo);
  const d = await destino(sb, conexion, link.cliente_legajo, null).catch(() => null);
  return { disponible: !!d && vigente(link) };
}

async function checkout(sb: SupabaseClient, b: Obj) {
  const clave = b.idempotency_key;
  if (typeof clave !== "string" || clave.length < 16 || clave.length > 100) {
    throw new HttpError(400, "Falta la clave del intento de pago");
  }
  const { data: previo } = await sb
    .from("pagos")
    .select("id")
    .eq("idempotency_key", clave)
    .maybeSingle();
  if (previo) {
    const { data: c } = await sb
      .from("cobre_cobros_r2p")
      .select("*")
      .eq("pago_id", previo.id)
      .maybeSingle();
    if (c?.clabe_dinamica) return respuestaCheckout(previo.id, c);
    throw new HttpError(409, "Este intento de pago no se pudo iniciar. Probá de nuevo.");
  }
  const link = await linkPorCodigo(sb, b.code);
  if (!vigente(link)) throw new HttpError(409, "El link de pago no está disponible");
  const total = Number(link.monto);
  const monto = link.pagos_parciales && b.monto ? Number(b.monto) : total;
  if (!Number.isFinite(monto) || monto <= 0 || monto > total)
    throw new HttpError(400, "Monto inválido");
  const pagador = pagadorValido(b.pagador);
  const conexion = await conexionDeCliente(sb, link.cliente_legajo);

  const { data: pago, error } = await sb
    .from("pagos")
    .insert({
      proveedor: "cobre",
      cliente_legajo: link.cliente_legajo,
      link_id: link.id,
      entorno: conexion.modo === "produccion" ? "produccion" : "sandbox",
      monto: Math.round(monto * 100) / 100,
      moneda: "MXN",
      metodo: "spei_cobre",
      pagador_nombre: pagador.nombre,
      pagador_email: pagador.correo,
      idempotency_key: clave,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return await checkout(sb, b);
    throw new HttpError(500, error.message);
  }
  try {
    const cobro = await crear(
      sb,
      link.cliente_legajo,
      { monto, concepto: link.referencia || "Pago con link", pagador: b.pagador, minutos: 60 },
      { linkId: link.id, pagoId: pago.id },
    );
    await sb.rpc("aplicar_estado_pago", {
      p_pago_id: pago.id,
      p_estado: "pendiente",
      p_metodo: "spei_cobre",
    });
    await sb
      .from("pagos")
      .update({
        proveedor_orden_id: (cobro as Obj).external_id,
        referencia: (cobro as Obj).clabe_dinamica ?? null,
        referencia_vence_at: (cobro as Obj).valido_hasta ?? null,
      })
      .eq("id", pago.id);
    return respuestaCheckout(pago.id, cobro as Obj);
  } catch (e) {
    await sb.rpc("aplicar_estado_pago", {
      p_pago_id: pago.id,
      p_estado: "error",
      p_motivo: (e as Error).message.slice(0, 200),
    });
    throw e;
  }
}

function respuestaCheckout(pagoId: string, c: Obj) {
  return {
    pago_id: pagoId,
    clabe: c.clabe_dinamica ?? null,
    vence_at: c.valido_hasta ?? null,
    monto: c.monto,
    estado: c.estado,
    aviso: c.aviso ?? null,
  };
}

async function estadoPago(sb: SupabaseClient, pagoId: unknown) {
  if (typeof pagoId !== "string" || !/^[0-9a-f-]{36}$/i.test(pagoId))
    throw new HttpError(400, "Pago inválido");
  const [{ data: pago }, { data: c }] = await Promise.all([
    sb
      .from("pagos")
      .select("id, estado, monto")
      .eq("id", pagoId)
      .eq("proveedor", "cobre")
      .maybeSingle(),
    sb
      .from("cobre_cobros_r2p")
      .select("clabe_dinamica, valido_hasta, estado")
      .eq("pago_id", pagoId)
      .maybeSingle(),
  ]);
  if (!pago) throw new HttpError(404, "Pago inexistente");
  return {
    pago_id: pago.id,
    estado: pago.estado,
    monto: pago.monto,
    clabe: c?.clabe_dinamica ?? null,
    vence_at: c?.valido_hasta ?? null,
    cobro: c?.estado ?? null,
  };
}
