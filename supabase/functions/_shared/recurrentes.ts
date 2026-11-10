// Suscripciones (tarjeta) y domiciliaciones (CLABE) en la cuenta de Ecart Pay del comercio.
// Docs: /docs/subscriptions, /docs/merchant-management-for-subscriptions, /docs/direct-debits,
// /docs/webhook-events.
//
// - Ecart Pay exige un "customer": se crea una vez por comercio, entorno y correo
//   (`proveedor_clientes`) y se reusa.
// - Suscripción: POST /api/subscriptions con merchant_management (devuelve `checkout_link`, que
//   el comercio comparte; el suscriptor agrega su tarjeta ahí y ahí se cobra) y notify_url hacia
//   `ecartpay-webhook`.
// - Domiciliación: POST /api/direct-debits con la CLABE (billing_account); Ecart Pay la valida y
//   la activa cuando el cliente acepta. Estado con PATCH /api/direct-debits/{id}.
// - Un aviso nunca cambia nada por su contenido: se consulta a Ecart Pay (la suscripción o la
//   orden del cargo) y solo con eso se actualiza el estado o se registra el cobro.
// - Idempotencia: la fila se guarda antes de llamar (`creando`, con idempotency_key). Si la
//   llamada queda sin respuesta clara, `sincronizar` la busca en Ecart Pay por customer antes de
//   permitir otra.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { clienteDeConexion, comercioDeLaSolicitud, conexionEcartPay } from "./conexiones.ts";
import { EcartPayCliente, EcartPayError } from "./ecartpay.ts";
import { HttpError } from "./http.ts";

type Obj = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v ? v : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ahora = () => new Date().toISOString();

export const INTERVALOS = ["daily", "weekly", "monthly", "quarterly", "semiannual", "yearly"];

export type Contexto = {
  sb: SupabaseClient;
  ecart: EcartPayCliente;
  comercioId: string;
  conexionId: string;
  entorno: "sandbox" | "produccion";
  legajo: string;
};

/** URL de avisos (la misma función que recibe los de órdenes). */
export function urlAvisos(): string {
  let base = "";
  try {
    base = Deno.env.get("SUPABASE_URL") ?? "";
  } catch {
    // Sin permiso de entorno (tests): la URL queda relativa.
  }
  return `${base.replace(/\/+$/, "")}/functions/v1/ecartpay-webhook`;
}

/** Error de Ecart Pay sin respuesta clara (sin conexión, timeout, 5xx): la operación pudo hacerse. */
export const esAmbiguo = (e: unknown) =>
  !(e instanceof EcartPayError) || e.status >= 500 || e.status === 408 || e.status === 429;

/** Página del portal a la que Ecart Pay manda al suscriptor después de poner su tarjeta. */
export function urlVueltaSuscriptor(): string {
  let base = "";
  try {
    base = Deno.env.get("APP_URL") ?? "";
  } catch {
    // Sin permiso de entorno (tests): la URL queda relativa.
  }
  return `${base.replace(/\/+$/, "")}/suscripcion/lista`;
}

// ── Customer ─────────────────────────────────────────────────────────────────

/** Customer de Ecart Pay para ese correo (lo crea la primera vez). */
export async function clienteEcart(
  ctx: Contexto,
  p: { email: string; nombre: string; telefono?: string | null },
): Promise<{ id: string; externo: string }> {
  const email = p.email.trim().toLowerCase();
  const { data: previo } = await ctx.sb
    .from("proveedor_clientes")
    .select("id, cliente_externo_id")
    .eq("comercio_id", ctx.comercioId)
    .eq("proveedor", "ecartpay")
    .eq("entorno", ctx.entorno)
    .eq("email", email)
    .maybeSingle();
  if (previo) return { id: previo.id, externo: previo.cliente_externo_id };

  const [nombre, ...resto] = p.nombre.trim().split(/\s+/);
  const r = await ctx.ecart.post<Obj>("/api/customers", {
    first_name: nombre,
    last_name: resto.join(" ") || undefined,
    email,
    phone: p.telefono?.replace(/\D/g, "") || undefined,
  });
  const externo = s(r.id) ?? s(r._id);
  if (!externo) throw new HttpError(502, "No se pudo registrar al cliente; intenta de nuevo");
  const { data, error } = await ctx.sb
    .from("proveedor_clientes")
    .upsert(
      {
        comercio_id: ctx.comercioId,
        proveedor: "ecartpay",
        entorno: ctx.entorno,
        email,
        nombre: p.nombre.trim(),
        telefono: p.telefono ?? null,
        cliente_externo_id: externo,
      },
      { onConflict: "comercio_id,proveedor,entorno,email" },
    )
    .select("id, cliente_externo_id")
    .single();
  if (error) throw new HttpError(500, error.message);
  return { id: data.id, externo: data.cliente_externo_id };
}

// ── Suscripciones ────────────────────────────────────────────────────────────

const ESTADO_SUSCRIPCION: Record<string, string> = {
  active: "activa",
  paused: "pausada",
  cancelled: "cancelada",
  canceled: "cancelada",
  ended: "terminada",
  finished: "terminada",
  completed: "terminada",
};

export type NuevaSuscripcion = {
  idempotencyKey: string;
  nombre: string;
  email: string;
  telefono?: string | null;
  servicio: string;
  beneficios: string[];
  monto: number;
  moneda: "MXN" | "USD";
  intervalo: string;
  frecuencia: number;
  diasPrueba: number;
  cicloDia: number | null;
  cicloMes: number | null;
  fechaFin: string | null;
  compromisoPeriodos: number | null;
  creadoPor: string | null;
};

/** Valida los datos de una suscripción nueva; devuelve el error o null. */
export function validarSuscripcion(d: NuevaSuscripcion): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return "Correo del suscriptor inválido";
  if (!d.nombre.trim()) return "Falta el nombre del suscriptor";
  if (!d.servicio.trim() || d.servicio.length > 120)
    return "El servicio es obligatorio (hasta 120 letras)";
  if (!(d.monto > 0) || Math.abs(d.monto * 100 - Math.round(d.monto * 100)) > 1e-6)
    return "Monto inválido";
  if (!INTERVALOS.includes(d.intervalo)) return "Frecuencia inválida";
  if (!Number.isInteger(d.frecuencia) || d.frecuencia < 1 || d.frecuencia > 12)
    return "Cada cuántos períodos: de 1 a 12";
  if (!Number.isInteger(d.diasPrueba) || d.diasPrueba < 0 || d.diasPrueba > 365)
    return "Días de prueba: de 0 a 365";
  if (d.cicloDia != null) {
    if (d.intervalo === "daily") return "El día de cobro no aplica a suscripciones diarias";
    const max = d.intervalo === "weekly" ? 7 : 31;
    if (!Number.isInteger(d.cicloDia) || d.cicloDia < 1 || d.cicloDia > max)
      return d.intervalo === "weekly" ? "Día de la semana: 1 (lunes) a 7" : "Día del mes: 1 a 31";
  }
  if (d.fechaFin && !/^\d{4}-\d{2}-\d{2}$/.test(d.fechaFin)) return "Fecha de fin inválida";
  if (d.fechaFin && d.fechaFin <= new Date().toISOString().slice(0, 10))
    return "La fecha de fin tiene que ser futura";
  return null;
}

/** Cuerpo de POST /api/subscriptions (merchant_management: Ecart Pay devuelve el checkout_link). */
export function suscripcionAEcart(customerId: string, d: NuevaSuscripcion): Obj {
  return {
    customer_id: customerId,
    amount: d.monto,
    currency: d.moneda,
    interval: d.intervalo,
    frequency: d.frecuencia,
    service: d.servicio.trim(),
    benefits: d.beneficios
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 10),
    ...(d.diasPrueba > 0 ? { trial_period_days: d.diasPrueba } : {}),
    ...(d.cicloDia != null ? { billing_cycle: { day: d.cicloDia, month: d.cicloMes ?? 1 } } : {}),
    ...(d.fechaFin ? { end_date: d.fechaFin } : {}),
    ...(d.compromisoPeriodos ? { commitment_periods: d.compromisoPeriodos } : {}),
    merchant_management: true,
    // Que Ecart Pay también avise al suscriptor (invitación, cobro fallido) por correo.
    mixed_management: true,
    notify_url: urlAvisos(),
    // Obligatorio para Ecart Pay (422 "redirect_url is required" sin él).
    redirect_url: urlVueltaSuscriptor(),
  };
}

/** Lo que guardamos de la suscripción según lo que devuelve Ecart Pay. */
export function suscripcionDeEcart(r: Obj): Obj {
  const estado = ESTADO_SUSCRIPCION[s(r.status) ?? ""] ?? null;
  return {
    ...(estado ? { estado } : {}),
    id_externo: s(r.id) ?? s(r._id),
    ...(s(r.checkout_link) ? { checkout_link: s(r.checkout_link) } : {}),
    intentos: n(r.attempts) ?? 0,
    proximo_cobro: s(r.next_payment_date),
    ultimo_error:
      Array.isArray(r.errors) && r.errors.length ? String(r.errors.at(-1)).slice(0, 300) : null,
    respuesta: r,
    sincronizada_at: ahora(),
    updated_at: ahora(),
  };
}

export async function crearSuscripcion(ctx: Contexto, d: NuevaSuscripcion): Promise<Obj> {
  const err = validarSuscripcion(d);
  if (err) throw new HttpError(400, err);

  const { data: previa } = await ctx.sb
    .from("suscripciones")
    .select("*")
    .eq("idempotency_key", d.idempotencyKey)
    .maybeSingle();
  if (previa) {
    if (previa.comercio_id !== ctx.comercioId) throw new HttpError(403, "Clave de otro comercio");
    return previa;
  }

  const cliente = await clienteEcart(ctx, {
    email: d.email,
    nombre: d.nombre,
    telefono: d.telefono,
  });
  const { data: fila, error } = await ctx.sb
    .from("suscripciones")
    .insert({
      comercio_id: ctx.comercioId,
      cliente_legajo: ctx.legajo,
      conexion_id: ctx.conexionId,
      entorno: ctx.entorno,
      proveedor_cliente_id: cliente.id,
      suscriptor_nombre: d.nombre.trim(),
      suscriptor_email: d.email.trim().toLowerCase(),
      servicio: d.servicio.trim(),
      beneficios: d.beneficios
        .map((b) => b.trim())
        .filter(Boolean)
        .slice(0, 10),
      monto: d.monto,
      moneda: d.moneda,
      intervalo: d.intervalo,
      frecuencia: d.frecuencia,
      dias_prueba: d.diasPrueba,
      ciclo_dia: d.cicloDia,
      ciclo_mes: d.cicloMes,
      fecha_fin: d.fechaFin,
      compromiso_periodos: d.compromisoPeriodos,
      idempotency_key: d.idempotencyKey,
      creado_por: d.creadoPor,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return await crearSuscripcion(ctx, d);
    throw new HttpError(500, error.message);
  }

  try {
    const r = await ctx.ecart.post<Obj>(
      "/api/subscriptions",
      suscripcionAEcart(cliente.externo, d),
    );
    const { data, error: e2 } = await ctx.sb
      .from("suscripciones")
      .update({ estado: "activa", ...suscripcionDeEcart(r) })
      .eq("id", fila.id)
      .select("*")
      .single();
    if (e2) throw new HttpError(500, e2.message);
    return data;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof EcartPayError ? `${e.message} (HTTP ${e.status})` : String(e);
    // Rechazo claro: no se creó. Sin respuesta clara queda `creando` y la sincronización la busca.
    if (!esAmbiguo(e)) {
      await ctx.sb
        .from("suscripciones")
        .update({ estado: "error", ultimo_error: msg.slice(0, 300), updated_at: ahora() })
        .eq("id", fila.id);
      throw new HttpError(422, `Se rechazó la suscripción: ${msg}`);
    }
    await ctx.sb
      .from("suscripciones")
      .update({ ultimo_error: msg.slice(0, 300), updated_at: ahora() })
      .eq("id", fila.id);
    throw new HttpError(
      502,
      "No hubo una respuesta clara. La suscripción queda en verificación; no la repitas.",
    );
  }
}

/** Trae el estado de Ecart Pay. Si quedó sin id (respuesta perdida), la busca por customer. */
export async function sincronizarSuscripcion(ctx: Contexto, fila: Obj): Promise<Obj> {
  let r: Obj | null = null;
  if (s(fila.id_externo)) {
    r = await ctx.ecart.get<Obj>(
      `/api/subscriptions/${encodeURIComponent(String(fila.id_externo))}`,
    );
  } else if (fila.estado === "creando" && fila.proveedor_cliente_id) {
    const { data: cli } = await ctx.sb
      .from("proveedor_clientes")
      .select("cliente_externo_id")
      .eq("id", String(fila.proveedor_cliente_id))
      .single();
    const lista = await ctx.ecart.get<Obj | Obj[]>("/api/subscriptions", {
      customer_id: cli?.cliente_externo_id,
    });
    const docs = (
      Array.isArray(lista) ? lista : ((lista.docs ?? lista.data ?? []) as Obj[])
    ) as Obj[];
    const desde = Date.parse(String(fila.created_at)) - 60_000;
    r =
      docs.find(
        (x) =>
          s(x.service) === fila.servicio &&
          Number(x.amount) === Number(fila.monto) &&
          Date.parse(String(x.created_at)) >= desde,
      ) ?? null;
    if (!r && Date.now() - Date.parse(String(fila.created_at)) > 15 * 60_000) {
      // Pasado el margen y sin rastro en Ecart Pay: no se creó.
      const { data } = await ctx.sb
        .from("suscripciones")
        .update({ estado: "error", ultimo_error: "No se registró", updated_at: ahora() })
        .eq("id", String(fila.id))
        .eq("estado", "creando")
        .select("*")
        .single();
      return data ?? fila;
    }
  }
  if (!r) return fila;
  const cambios = suscripcionDeEcart(r);
  if (fila.estado === "creando" && !cambios.estado) cambios.estado = "activa";
  const { data, error } = await ctx.sb
    .from("suscripciones")
    .update(cambios)
    .eq("id", String(fila.id))
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  return data;
}

/** Pausa, reanuda o cancela en Ecart Pay (PUT /api/subscriptions/{id}) y guarda el resultado. */
export async function cambiarEstadoSuscripcion(
  ctx: Contexto,
  fila: Obj,
  estado: "active" | "paused" | "cancelled",
): Promise<Obj> {
  if (!s(fila.id_externo)) throw new HttpError(409, "La suscripción todavía no está registrada");
  if (fila.estado === "cancelada" || fila.estado === "terminada")
    throw new HttpError(409, "La suscripción ya terminó");
  const r = await ctx.ecart.request<Obj>(
    "PUT",
    `/api/subscriptions/${encodeURIComponent(String(fila.id_externo))}`,
    { body: { status: estado } },
  );
  const cambios = suscripcionDeEcart(r ?? {});
  if (!cambios.estado) cambios.estado = ESTADO_SUSCRIPCION[estado];
  const { data, error } = await ctx.sb
    .from("suscripciones")
    .update(cambios)
    .eq("id", String(fila.id))
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  return data;
}

// ── Domiciliaciones ──────────────────────────────────────────────────────────

const ESTADOS_DOMICILIACION = ["created", "active", "pending", "completed", "cancelled"];

export type NuevaDomiciliacion = {
  idempotencyKey: string;
  nombre: string;
  email: string;
  telefono?: string | null;
  rfc: string | null;
  clabe: string;
  alias: string;
  concepto: string;
  monto: number;
  recurrente: boolean;
  intervalo: string | null;
  cicloDia: number | null;
  fechaFin: string | null;
  creadoPor: string | null;
};

/** Dígito verificador de la CLABE (pesos 3, 7, 1). */
export function clabeValida(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false;
  const pesos = [3, 7, 1];
  const suma = [...clabe.slice(0, 17)].reduce(
    (t, d, i) => t + ((Number(d) * pesos[i % 3]) % 10),
    0,
  );
  return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}

export function validarDomiciliacion(d: NuevaDomiciliacion): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return "Correo del titular inválido";
  if (!d.nombre.trim()) return "Falta el nombre del titular";
  if (!clabeValida(d.clabe)) return "CLABE inválida (18 dígitos con dígito verificador)";
  if (d.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(d.rfc)) return "RFC inválido";
  if (!d.concepto.trim() || d.concepto.length > 120)
    return "El concepto es obligatorio (hasta 120 letras)";
  if (!(d.monto > 0) || Math.abs(d.monto * 100 - Math.round(d.monto * 100)) > 1e-6)
    return "Monto inválido";
  if (d.recurrente && !INTERVALOS.includes(d.intervalo ?? "")) return "Frecuencia inválida";
  if (d.cicloDia != null && (!Number.isInteger(d.cicloDia) || d.cicloDia < 1 || d.cicloDia > 31))
    return "Día de cobro: 1 a 31";
  if (d.fechaFin && !/^\d{4}-\d{2}-\d{2}$/.test(d.fechaFin)) return "Fecha de fin inválida";
  return null;
}

export function domiciliacionAEcart(customerId: string, d: NuevaDomiciliacion): Obj {
  return {
    customer_id: customerId,
    amount: d.monto,
    currency: "MXN",
    concept: d.concepto.trim(),
    is_recurring: d.recurrente,
    ...(d.recurrente ? { interval: d.intervalo } : {}),
    ...(d.cicloDia != null ? { billing_cycle: { day: d.cicloDia } } : {}),
    ...(d.fechaFin ? { end_date: d.fechaFin } : {}),
    billing_account: {
      clabe: d.clabe,
      alias: d.alias.trim().slice(0, 40) || "Cuenta principal",
      ...(d.rfc ? { customer_rfc: d.rfc } : {}),
    },
  };
}

export function domiciliacionDeEcart(r: Obj): Obj {
  const st = s(r.status);
  return {
    ...(st && ESTADOS_DOMICILIACION.includes(st) ? { estado: st } : {}),
    id_externo: s(r.id) ?? s(r._id) ?? s(r.direct_debit_id),
    referencia: r.reference != null ? String(r.reference) : null,
    nivel_validacion: n(r.validation_level),
    proximo_cobro: s(r.next_payment_date),
    respuesta: r,
    sincronizada_at: ahora(),
    updated_at: ahora(),
  };
}

export async function crearDomiciliacion(ctx: Contexto, d: NuevaDomiciliacion): Promise<Obj> {
  const err = validarDomiciliacion(d);
  if (err) throw new HttpError(400, err);
  const { data: previa } = await ctx.sb
    .from("domiciliaciones")
    .select("*")
    .eq("idempotency_key", d.idempotencyKey)
    .maybeSingle();
  if (previa) {
    if (previa.comercio_id !== ctx.comercioId) throw new HttpError(403, "Clave de otro comercio");
    return previa;
  }

  const cliente = await clienteEcart(ctx, {
    email: d.email,
    nombre: d.nombre,
    telefono: d.telefono,
  });
  const { data: fila, error } = await ctx.sb
    .from("domiciliaciones")
    .insert({
      comercio_id: ctx.comercioId,
      cliente_legajo: ctx.legajo,
      conexion_id: ctx.conexionId,
      entorno: ctx.entorno,
      proveedor_cliente_id: cliente.id,
      titular_nombre: d.nombre.trim(),
      titular_email: d.email.trim().toLowerCase(),
      titular_rfc: d.rfc,
      clabe: d.clabe,
      alias: d.alias.trim().slice(0, 40) || "Cuenta principal",
      concepto: d.concepto.trim(),
      monto: d.monto,
      recurrente: d.recurrente,
      intervalo: d.recurrente ? d.intervalo : null,
      ciclo_dia: d.cicloDia,
      fecha_fin: d.fechaFin,
      idempotency_key: d.idempotencyKey,
      creado_por: d.creadoPor,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return await crearDomiciliacion(ctx, d);
    throw new HttpError(500, error.message);
  }

  try {
    const r = await ctx.ecart.post<Obj>(
      "/api/direct-debits",
      domiciliacionAEcart(cliente.externo, d),
    );
    const cambios = domiciliacionDeEcart(r);
    if (!cambios.estado) cambios.estado = "created";
    const { data, error: e2 } = await ctx.sb
      .from("domiciliaciones")
      .update(cambios)
      .eq("id", fila.id)
      .select("*")
      .single();
    if (e2) throw new HttpError(500, e2.message);
    return data;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof EcartPayError ? `${e.message} (HTTP ${e.status})` : String(e);
    if (!esAmbiguo(e)) {
      await ctx.sb
        .from("domiciliaciones")
        .update({ estado: "error", ultimo_error: msg.slice(0, 300), updated_at: ahora() })
        .eq("id", fila.id);
      throw new HttpError(422, `Se rechazó la domiciliación: ${msg}`);
    }
    await ctx.sb
      .from("domiciliaciones")
      .update({ ultimo_error: msg.slice(0, 300), updated_at: ahora() })
      .eq("id", fila.id);
    throw new HttpError(
      502,
      "No hubo una respuesta clara. La domiciliación queda en verificación; no la repitas.",
    );
  }
}

export async function sincronizarDomiciliacion(ctx: Contexto, fila: Obj): Promise<Obj> {
  let r: Obj | null = null;
  if (s(fila.id_externo)) {
    r = await ctx.ecart.get<Obj>(
      `/api/direct-debits/${encodeURIComponent(String(fila.id_externo))}`,
    );
  } else if (fila.estado === "creando" && fila.proveedor_cliente_id) {
    const { data: cli } = await ctx.sb
      .from("proveedor_clientes")
      .select("cliente_externo_id")
      .eq("id", String(fila.proveedor_cliente_id))
      .single();
    const lista = await ctx.ecart.get<Obj | Obj[]>("/api/direct-debits", {
      customer_id: cli?.cliente_externo_id,
    });
    const docs = (
      Array.isArray(lista) ? lista : ((lista.docs ?? lista.data ?? []) as Obj[])
    ) as Obj[];
    const desde = Date.parse(String(fila.created_at)) - 60_000;
    r =
      docs.find(
        (x) =>
          s(x.concept) === fila.concepto &&
          Number(x.amount) === Number(fila.monto) &&
          Date.parse(String(x.created_at)) >= desde,
      ) ?? null;
    if (!r && Date.now() - Date.parse(String(fila.created_at)) > 15 * 60_000) {
      const { data } = await ctx.sb
        .from("domiciliaciones")
        .update({ estado: "error", ultimo_error: "No se registró", updated_at: ahora() })
        .eq("id", String(fila.id))
        .eq("estado", "creando")
        .select("*")
        .single();
      return data ?? fila;
    }
  }
  if (!r) return fila;
  const { data, error } = await ctx.sb
    .from("domiciliaciones")
    .update(domiciliacionDeEcart(r))
    .eq("id", String(fila.id))
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  return data;
}

export async function cancelarDomiciliacion(ctx: Contexto, fila: Obj): Promise<Obj> {
  if (!s(fila.id_externo)) throw new HttpError(409, "La domiciliación todavía no está registrada");
  if (["cancelled", "completed", "error", "rechazada"].includes(String(fila.estado)))
    throw new HttpError(409, "La domiciliación ya no está activa");
  const r = await ctx.ecart.request<Obj>(
    "PATCH",
    `/api/direct-debits/${encodeURIComponent(String(fila.id_externo))}`,
    { body: { status: "cancelled" } },
  );
  const cambios = domiciliacionDeEcart(r ?? {});
  if (!cambios.estado) cambios.estado = "cancelled";
  const { data, error } = await ctx.sb
    .from("domiciliaciones")
    .update(cambios)
    .eq("id", String(fila.id))
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  return data;
}

// ── Avisos (webhook) ─────────────────────────────────────────────────────────

/** Tipo de aviso de cobro recurrente. Los de suscripción por notify_url pueden venir sin `event`. */
export function eventoRecurrente(evento: string | null, cuerpo: unknown): string | null {
  if (evento?.startsWith("subscription.") || evento?.startsWith("direct_debit.")) return evento;
  const c = (cuerpo ?? {}) as Obj;
  if (s(c.id) && s(c.service) && s(c.interval) && s(c.customer_id)) return "subscription.notify";
  return null;
}

/** Id de Ecart Pay de la suscripción o domiciliación del aviso. */
export function idRecurrente(cuerpo: unknown): string | null {
  const c = (cuerpo ?? {}) as Obj;
  const d = (c.data && typeof c.data === "object" ? c.data : c) as Obj;
  return s(d.direct_debit_id) ?? s(d.subscription_id) ?? s(d.id) ?? s(d._id);
}

/** Resumen que se guarda de un aviso sin firma (lo necesario para confirmarlo, no el cuerpo). */
export function resumenAvisoRecurrente(cuerpo: unknown): Obj {
  const c = (cuerpo ?? {}) as Obj;
  const d = (c.data && typeof c.data === "object" ? c.data : c) as Obj;
  return {
    id: idRecurrente(cuerpo),
    status: s(d.status),
    updated_at: s(d.updated_at),
    order_id: s(d.order_id),
    payment_status: s(d.payment_status),
    message: s(d.message)?.slice(0, 200) ?? null,
  };
}

export async function contextoDeFila(
  sb: SupabaseClient,
  fila: { conexion_id: string; comercio_id: string; cliente_legajo: string; entorno: string },
): Promise<Contexto> {
  const { data: con } = await sb
    .from("comercio_proveedores")
    .select("id, comercio_id, entorno, public_id")
    .eq("id", fila.conexion_id)
    .maybeSingle();
  if (!con?.public_id) throw new HttpError(409, "La conexión del comercio ya no está activa");
  return {
    sb,
    ecart: await clienteDeConexion(sb, {
      id: con.id,
      comercioId: con.comercio_id,
      entorno: con.entorno as Contexto["entorno"],
      publicId: con.public_id,
    }),
    comercioId: fila.comercio_id,
    conexionId: con.id,
    entorno: fila.entorno as Contexto["entorno"],
    legajo: fila.cliente_legajo,
  };
}

/**
 * Procesa un aviso de suscripción o domiciliación: actualiza el estado consultando a Ecart Pay y
 * registra el cobro solo si Ecart Pay lo confirma (la suscripción ya refleja ese cambio, o la
 * orden del cargo está pagada). Devuelve el resultado para `webhook_eventos`.
 */
export async function procesarAvisoRecurrente(
  sb: SupabaseClient,
  evento: string,
  cuerpo: unknown,
): Promise<string> {
  const r = resumenAvisoRecurrente(cuerpo);
  if (!r.id) return "sin id";

  if (evento.startsWith("subscription.")) {
    const { data: fila } = await sb
      .from("suscripciones")
      .select("*")
      .eq("id_externo", String(r.id))
      .maybeSingle();
    if (!fila) return "suscripción desconocida";
    const ctx = await contextoDeFila(sb, fila);
    const act = await sincronizarSuscripcion(ctx, fila);
    const resp = (act.respuesta ?? {}) as Obj;
    // El aviso trae el `updated_at` del cambio; si Ecart Pay ya lo refleja, el cobro es real.
    const cambio = s(r.updated_at);
    const confirmado = !!cambio && Date.parse(String(resp.updated_at)) >= Date.parse(cambio);
    // Por notify_url el aviso puede venir sin `event`: el tipo sale del mensaje.
    const mensaje = String(r.message ?? "");
    const exito =
      evento === "subscription.payment_success" ||
      (evento === "subscription.notify" && /payment.*success/i.test(mensaje));
    const fallo =
      evento === "subscription.payment_failed" ||
      evento === "subscription.paused" ||
      (evento === "subscription.notify" && /payment.*fail|paused/i.test(mensaje));
    if (confirmado && (exito || fallo)) {
      await sb.from("cobros_recurrentes").upsert(
        {
          tipo: "suscripcion",
          suscripcion_id: act.id,
          comercio_id: act.comercio_id,
          cliente_legajo: act.cliente_legajo,
          monto: Number(resp.amount ?? act.monto),
          moneda: String(resp.currency ?? act.moneda),
          estado: fallo ? "fallido" : "pagado",
          motivo: fallo ? (act.ultimo_error as string | null) : null,
          clave_externa: `${r.id}:${cambio}`,
          cobrado_at: cambio,
        },
        { onConflict: "tipo,clave_externa", ignoreDuplicates: true },
      );
    }
    return `suscripción ${act.estado}${confirmado && (exito || fallo) ? (fallo ? " · cobro fallido" : " · cobro") : ""}`;
  }

  // Domiciliación.
  const { data: fila } = await sb
    .from("domiciliaciones")
    .select("*")
    .eq("id_externo", String(r.id))
    .maybeSingle();
  if (!fila) return "domiciliación desconocida";
  const ctx = await contextoDeFila(sb, fila);
  let act = await sincronizarDomiciliacion(ctx, fila);
  if (evento === "direct_debit.validation_rejected") {
    const { data } = await sb
      .from("domiciliaciones")
      .update({
        estado: "rechazada",
        ultimo_error: "Se rechazó la validación de la cuenta",
        updated_at: ahora(),
      })
      .eq("id", act.id)
      .select("*")
      .single();
    act = data ?? act;
  }
  if (
    (evento === "direct_debit.payment_success" || evento === "direct_debit.payment_failed") &&
    r.order_id
  ) {
    const orden = await ctx.ecart.get<Obj>(`/api/orders/${encodeURIComponent(String(r.order_id))}`);
    const st = s(orden.status) ?? "";
    const pagada = ["paid", "completed", "refunded", "partially_refunded"].includes(st);
    if (evento === "direct_debit.payment_success" ? pagada : !pagada) {
      await sb.from("cobros_recurrentes").upsert(
        {
          tipo: "domiciliacion",
          domiciliacion_id: act.id,
          comercio_id: act.comercio_id,
          cliente_legajo: act.cliente_legajo,
          monto: Number(orden.total ?? orden.amount ?? act.monto),
          moneda: String(orden.currency ?? "MXN"),
          estado: pagada ? "pagado" : "fallido",
          motivo: pagada ? null : `Orden ${st || "sin estado"}`,
          clave_externa: String(r.order_id),
          orden_externa_id: String(r.order_id),
          cobrado_at: s(orden.paid_at) ?? ahora(),
        },
        { onConflict: "tipo,clave_externa", ignoreDuplicates: true },
      );
      return `domiciliación ${act.estado} · ${pagada ? "cobro" : "cobro fallido"}`;
    }
    return `domiciliación ${act.estado} · aviso no confirmado por la orden`;
  }
  return `domiciliación ${act.estado}`;
}

// ── Contexto de una solicitud del portal o del admin ─────────────────────────

/** Comercio (admin con `comercio_id` o el comercio dueño), su conexión y su cliente de Ecart Pay. */
export async function contextoDeSolicitud(
  req: Request,
  sb: SupabaseClient,
  comercioPedido: unknown,
): Promise<Contexto> {
  const comercioId = await comercioDeLaSolicitud(req, sb, comercioPedido);
  const conexion = await conexionEcartPay(sb, [comercioId]);
  if (!conexion) throw new HttpError(409, "El comercio no tiene activados los cobros con tarjeta");
  const { data: comercio } = await sb
    .from("comercios")
    .select("legajo")
    .eq("id", comercioId)
    .single();
  if (!comercio?.legajo) throw new HttpError(404, "Comercio inexistente");
  return {
    sb,
    ecart: await clienteDeConexion(sb, conexion),
    comercioId,
    conexionId: conexion.id,
    entorno: conexion.entorno,
    legajo: comercio.legajo,
  };
}

/** Texto, número o fecha opcionales del body. */
export const texto = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
export const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
