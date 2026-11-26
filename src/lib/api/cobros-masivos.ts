import { requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { DataAccessError } from "./errors";
import {
  buildResolvableUrl,
  toResolvableLinkPagoUrl as toResolvableLinkPagoUrlShared,
} from "@/lib/pay-url";

// Re-export para mantener compatibilidad con imports existentes desde este módulo.
export const toResolvableLinkPagoUrl = toResolvableLinkPagoUrlShared;

// ===== Tipos principales =====
export type LoteEstado =
  "cargado" | "en_proceso" | "finalizado" | "pausado" | "eliminado" | "error";

export type MedioPago = "TRANSFERENCIA" | "TARJETA_CREDITO" | "TARJETA_DEBITO";

export type RegistroEstado = "pendiente" | "pagado_total" | "pagado_parcial" | "vencido" | "error";

export type PagoEstado = "aprobado" | "pendiente" | "rechazado";

export type TipoOperacion = "TRANSFERENCIA_BANCARIA" | "TARJETA_DEBITO_CREDITO";

export interface Lote {
  id: string;
  cliente_legajo?: string;
  nombre: string;
  periodo: string;
  diaProcesamiento: string;
  estado: LoteEstado;
  tasaInteres: number;
  fechaVencimiento1: string;
  fechaVencimiento2: string | null;
  fechaVencimiento3: string | null;
  mediosPago: MedioPago[];
  pagosParcialesHabilitado: boolean;
  notificacionesHabilitado: boolean;
  createdAt: string;
  fechaInicio: string | null;
  fechaFinalizacion: string | null;
}

export interface RegistroDeLote {
  id: string;
  loteId: string;
  tipoEntidad: string;
  idEntidad: string;
  subEntidad: string;
  identificacionUsuario: string;
  monto: number;
  descripcion: string;
  email: string | null;
  periodoFacturacion: string | null;
  idUnicoBeneficiario: string | null;
  fechaVencimiento1: string | null;
  fechaVencimiento2: string | null;
  fechaVencimiento3: string | null;
  tasaInteres: number | null;
  mediosPago: MedioPago[] | null;
  pagosParcialesHabilitado: boolean | null;
  cbuId: string | null;
  linkDePago: string | null;
  estado: RegistroEstado;
  montoPagado: number;
  fechaPago: string | null;
  createdAt: string;
  emailEnviado: boolean;
}

export interface Pago {
  id: string;
  registroId: string;
  loteId: string;
  monto: number;
  montoDeclarado: number | null;
  medioPago: MedioPago;
  tipoOperacion: TipoOperacion;
  timestamp: string;
  estado: PagoEstado;
  externalReference: string | null;
}

// ===== Helpers =====
function generateId(prefix: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let r = "";
  for (const x of bytes) r += chars[x % chars.length];
  return `${prefix}-${r}`;
}

// ===== Formateo =====
// toResolvableLinkPagoUrl se re-exporta desde @/lib/pay-url arriba.
// Mantener imports existentes en otros archivos sin cambios.

// ===== Catálogo de estados =====
export const estadoCatalogo: Record<LoteEstado, { label: string; desc: string }> = {
  cargado: {
    label: "Cargado / Pendiente",
    desc: "El lote fue creado y validado, pero aun no llego la fecha de procesamiento; no se generaron links de pago todavia.",
  },
  en_proceso: {
    label: "En proceso",
    desc: "El lote ya se ejecuto (se generaron los links) pero no todos los pagos fueron efectuados.",
  },
  finalizado: {
    label: "Finalizado",
    desc: "Todos los pagos del lote fueron efectuados en su totalidad.",
  },
  pausado: {
    label: "Pausado",
    desc: "El lote fue pausado manualmente; detiene el avance del procesamiento.",
  },
  eliminado: {
    label: "Eliminado",
    desc: "El lote fue eliminado (soft delete).",
  },
  error: {
    label: "Con error / requiere atencion",
    desc: "Ocurrio un fallo tecnico durante el procesamiento que impide completar la generacion de links o el cobro.",
  },
};

export const medioPagoLabels: Record<MedioPago, string> = {
  TRANSFERENCIA: "Transferencia",
  TARJETA_CREDITO: "Tarjeta de credito",
  TARJETA_DEBITO: "Tarjeta de debito",
};

// ===== Helper: parsear JSONB que puede venir como string o array =====
function parseJsonbArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ===== Helper: mapear row de Supabase a Lote =====
function rowToLote(row: Tables<"lotes">): Lote {
  return {
    id: row.id,
    cliente_legajo: row.cliente_legajo,
    nombre: row.nombre,
    periodo: row.periodo,
    diaProcesamiento: String(row.dia_pago),
    estado: row.estado as LoteEstado,
    tasaInteres: Number(row.tasa_interes),
    fechaVencimiento1: row.fecha_venc_1,
    fechaVencimiento2: row.fecha_venc_2,
    fechaVencimiento3: row.fecha_venc_3,
    mediosPago: parseJsonbArray(row.medios_pago) as MedioPago[],
    pagosParcialesHabilitado: row.pagos_parciales ?? true,
    notificacionesHabilitado: row.notificaciones ?? false,
    createdAt: row.created_at,
    fechaInicio: row.fecha_inicio,
    fechaFinalizacion: row.fecha_finalizacion,
  };
}

function rowToRegistro(row: Tables<"lote_registros">): RegistroDeLote {
  return {
    id: row.id,
    loteId: row.lote_id,
    tipoEntidad: row.tipo_entidad,
    idEntidad: row.id_entidad,
    subEntidad: row.sub_entidad,
    identificacionUsuario: row.identificacion_usuario,
    monto: Number(row.monto),
    descripcion: row.descripcion ?? "",
    email: row.email ?? null,
    periodoFacturacion: row.periodo_facturacion ?? null,
    idUnicoBeneficiario: row.id_unico_beneficiario ?? null,
    fechaVencimiento1: row.fecha_venc_1 ?? null,
    fechaVencimiento2: row.fecha_venc_2 ?? null,
    fechaVencimiento3: row.fecha_venc_3 ?? null,
    tasaInteres: row.tasa_interes != null ? Number(row.tasa_interes) : null,
    mediosPago: parseJsonbArray(row.medios_pago) as MedioPago[] | null,
    pagosParcialesHabilitado: row.pagos_parciales ?? null,
    cbuId: row.cbu_id ?? null,
    linkDePago: row.link_de_pago ?? null,
    estado: row.estado as RegistroEstado,
    montoPagado: Number(row.monto_pagado ?? 0),
    fechaPago: row.fecha_pago ?? null,
    createdAt: row.created_at,
    emailEnviado: row.email_enviado ?? false,
  };
}

// ===== Obtener legajo del usuario logueado =====
export async function getLegajoUsuario(): Promise<string | null> {
  try {
    const s = requireSupabase();
    const { data: u } = await s.auth.getUser();
    const mail = u.user?.email;
    if (!mail) return null;
    const { data: cli } = await s
      .from("clientes")
      .select("legajo")
      .eq("correo", mail)
      .maybeSingle();
    return cli?.legajo ?? null;
  } catch {
    return null;
  }
}

// ===== CRUD de lotes (Supabase) =====

export async function crearLoteDB(
  lote: Lote,
  registros: Omit<RegistroDeLote, "createdAt">[],
  legajo: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const s = requireSupabase();

    const batch = registros.map((r) => ({
      id: r.id,
      tipo_entidad: r.tipoEntidad,
      id_entidad: r.idEntidad,
      sub_entidad: r.subEntidad,
      identificacion_usuario: r.identificacionUsuario,
      monto: r.monto,
      descripcion: r.descripcion,
      email: r.email,
      periodo_facturacion: r.periodoFacturacion,
      id_unico_beneficiario: r.idUnicoBeneficiario,
      fecha_venc_1: r.fechaVencimiento1 || null,
      fecha_venc_2: r.fechaVencimiento2 || null,
      fecha_venc_3: r.fechaVencimiento3 || null,
      tasa_interes: r.tasaInteres,
      medios_pago: r.mediosPago ?? null,
      pagos_parciales: r.pagosParcialesHabilitado,
    }));

    // Lote y registros en una sola transacción (migración 1069): si algo falla no queda nada.
    const { error } = await s.rpc("crear_lote_con_registros", {
      p_id: lote.id,
      p_cliente_legajo: legajo,
      p_nombre: lote.nombre,
      p_periodo: lote.periodo,
      p_dia_pago: parseInt(lote.diaProcesamiento),
      p_tasa_interes: lote.tasaInteres,
      p_fecha_venc_1: lote.fechaVencimiento1,
      // Los tipos generados no marcan nullables los args de RPC; en SQL p_fecha_venc_2/3 (date) aceptan NULL.
      p_fecha_venc_2: (lote.fechaVencimiento2 || null) as unknown as string,
      p_fecha_venc_3: (lote.fechaVencimiento3 || null) as unknown as string,
      p_medios_pago: lote.mediosPago,
      p_pagos_parciales: lote.pagosParcialesHabilitado,
      p_notificaciones: lote.notificacionesHabilitado,
      p_registros: batch,
    });
    if (error) return { ok: false, error: error.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Lotes del cliente con sus montos (calculados por la base, sin tope de filas). */
export async function getLotesGestionDB(): Promise<LoteGestionRow[]> {
  const s = requireSupabase();
  const { data, error } = await s.rpc("portal_lotes_gestion");
  if (error) throw new DataAccessError(error);
  return (data ?? []).map((l) => {
    const montoTotal = Number(l.monto_total);
    const montoCobrado = Number(l.monto_cobrado);
    return {
      id: l.id,
      nombre: l.nombre,
      periodo: l.periodo,
      createdAt: l.created_at,
      fechaFinalizacion: l.fecha_finalizacion,
      estado: l.estado as LoteEstado,
      progreso: montoTotal > 0 ? Math.round((montoCobrado / montoTotal) * 100) : 0,
      cantidadPagos: Number(l.pagados),
      cantidadParciales: Number(l.parciales),
      cantidadPendientes: Number(l.pendientes),
      montoTotal,
      montoCobrado,
      montoPorCobrar: montoTotal - montoCobrado,
    };
  });
}

export async function getLoteByIdDB(id: string): Promise<Lote | null> {
  try {
    const s = requireSupabase();
    const { data, error } = await s.from("lotes").select("*").eq("id", id).maybeSingle();
    if (error) {
      return null;
    }
    return data ? rowToLote(data) : null;
  } catch {
    return null;
  }
}

export async function getRegistrosByLoteIdDB(loteId: string): Promise<RegistroDeLote[]> {
  try {
    const s = requireSupabase();
    const { data, error } = await s
      .from("lote_registros")
      .select("*")
      .eq("lote_id", loteId)
      .order("created_at", { ascending: true });
    if (error) {
      return [];
    }
    return (data ?? []).map(rowToRegistro);
  } catch {
    return [];
  }
}

/**
 * Pone el lote en proceso y genera los links que falten (función `iniciar_lote`, migración 1069):
 * todo en una transacción, con códigos generados por el servidor. `force` regenera todos.
 */
export async function iniciarLoteDB(
  loteId: string,
  _legajo: string,
  force = false,
): Promise<{ ok: boolean; error?: string; linksCount: number }> {
  try {
    const s = requireSupabase();
    const { data, error } = await s.rpc("iniciar_lote", {
      p_lote_id: loteId,
      p_url_base: buildResolvableUrl("nuevo"),
      p_forzar: force,
    });
    if (error) return { ok: false, error: error.message, linksCount: 0 };
    return { ok: true, linksCount: Number(data ?? 0) };
  } catch (e) {
    return { ok: false, error: String(e), linksCount: 0 };
  }
}

export async function pausarLoteDB(loteId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const s = requireSupabase();
    const { error } = await s.rpc("actualizar_estado_lote", {
      p_lote_id: loteId,
      p_estado: "pausado",
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function reanudarLoteDB(loteId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const s = requireSupabase();
    const { error } = await s.rpc("actualizar_estado_lote", {
      p_lote_id: loteId,
      p_estado: "en_proceso",
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function eliminarLoteDB(loteId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const s = requireSupabase();
    const { error } = await s.rpc("eliminar_lote", { p_lote_id: loteId });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ===== Tipos de consulta =====
export interface LoteGestionRow {
  id: string;
  nombre: string;
  periodo: string;
  createdAt: string;
  fechaFinalizacion: string | null;
  estado: LoteEstado;
  progreso: number;
  cantidadPagos: number;
  cantidadParciales: number;
  cantidadPendientes: number;
  montoTotal: number;
  montoCobrado: number;
  montoPorCobrar: number;
}

// ===== Export helpers (re-export for backward compat) =====
export { generateId };

// ===== Dashboard helpers =====
export interface PeriodFilter {
  label: string;
  from: Date;
  to: Date;
}

export function periodFilter(label: string, days?: number, from?: Date, to?: Date): PeriodFilter {
  const now = new Date();
  if (days !== undefined) {
    const f = new Date(now);
    f.setDate(f.getDate() - days);
    return { label, from: f, to: now };
  }
  return { label, from: from!, to: to! };
}

export interface DashboardKPI {
  totalLotes: number;
  enProceso: number;
  finalizados: number;
  conError: number;
  montoTotal: number;
  montoCobrado: number;
  montoPendiente: number;
}

export interface MedioPagoData {
  medio: string;
  monto: number;
  cantidad: number;
  porcentaje: number;
}

export async function computePorMedio(_filter: PeriodFilter): Promise<MedioPagoData[]> {
  // Placeholder: requires pagos table or payment data. Return empty for now.
  return [];
}

export interface VencimientoData {
  label: string;
  cantidad: number;
  monto: number;
}

export async function computePorVencimiento(_filter: PeriodFilter): Promise<VencimientoData[]> {
  return [
    { label: "1er vencimiento", cantidad: 0, monto: 0 },
    { label: "2do vencimiento", cantidad: 0, monto: 0 },
    { label: "3er vencimiento", cantidad: 0, monto: 0 },
  ];
}

export interface NoCobradasData {
  totalOperaciones: number;
  vencidas: number;
  vigentes: number;
  montoNoCobrado: number;
  porcentajeNoCobrado: number;
}

export interface EvolucionData {
  fecha: string;
  monto: number;
  cantidad: number;
}

export async function computeEvolucion(_filter: PeriodFilter): Promise<EvolucionData[]> {
  // Placeholder: requires pagos table with timestamps. Return empty for now.
  return [];
}

export interface LoteResumen {
  id: string;
  nombre: string;
  estado: LoteEstado;
  progreso: number;
  montoTotal: number;
  montoCobrado: number;
  cantidadPagos: number;
  cantidadParciales: number;
  cantidadPendientes: number;
  createdAt: string;
}

export type ResumenCobrosMasivos = {
  kpi: DashboardKPI;
  noCobradas: NoCobradasData;
  lotesRecientes: LoteResumen[];
};

/**
 * KPIs, no cobradas y lotes recientes del período, calculados por la base sobre todos los
 * registros (antes se leían en el navegador y se cortaban en 1000).
 */
export async function getResumenCobrosMasivos(filter: PeriodFilter): Promise<ResumenCobrosMasivos> {
  const s = requireSupabase();
  const { data, error } = await s.rpc("portal_resumen_cobros_masivos", {
    p_desde: filter.from.toISOString(),
    p_hasta: filter.to.toISOString(),
  });
  if (error) throw new DataAccessError(error);
  return data as unknown as ResumenCobrosMasivos;
}
