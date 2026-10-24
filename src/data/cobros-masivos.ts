import { requireSupabase } from "@/lib/supabase";
import {
  buildResolvableUrl,
  toResolvableLinkPagoUrl as toResolvableLinkPagoUrlShared,
} from "@/lib/pay-url";

// Re-export para mantener compatibilidad con imports existentes desde este módulo.
export const toResolvableLinkPagoUrl = toResolvableLinkPagoUrlShared;

// ===== Tipos principales =====
export type LoteEstado =
  "cargado" | "en_proceso" | "finalizado" | "pausado" | "eliminado" | "error";

export type MedioPago = "TRANSFERENCIA" | "TARJETA_CREDITO" | "TARJETA_DEBITO" | "QR";

export type RegistroEstado = "pendiente" | "pagado_total" | "pagado_parcial" | "vencido" | "error";

export type PagoEstado = "aprobado" | "pendiente" | "rechazado";

export type TipoOperacion = "TRANSFERENCIA_BANCARIA" | "QR" | "TARJETA_DEBITO_CREDITO";

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

export interface CBURecord {
  id: string;
  tipoEntidad: string;
  idEntidad: string;
  subEntidad: string;
  cbu: string;
  alias: string;
  createdAt: string;
}

// ===== Helpers =====
function generateId(prefix: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let r = "";
  for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${r}`;
}

function parseDate(s: string): Date {
  try { return new Date(s); } catch { return new Date(); }
}

// ===== Formateo =====
export function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(n);
}

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
  QR: "Codigo QR",
};

// ===== Helper: parsear JSONB que puede venir como string o array =====
function parseJsonbArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// ===== Helper: mapear row de Supabase a Lote =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLote(row: any): Lote {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRegistro(row: any): RegistroDeLote {
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

    const { error: loteErr } = await s.rpc("crear_lote", {
      p_id: lote.id,
      p_cliente_legajo: legajo,
      p_nombre: lote.nombre,
      p_periodo: lote.periodo,
      p_dia_pago: parseInt(lote.diaProcesamiento),
      p_tasa_interes: lote.tasaInteres,
      p_fecha_venc_1: lote.fechaVencimiento1,
      p_fecha_venc_2: lote.fechaVencimiento2 || null,
      p_fecha_venc_3: lote.fechaVencimiento3 || null,
      p_medios_pago: JSON.stringify(lote.mediosPago),
      p_pagos_parciales: lote.pagosParcialesHabilitado,
      p_notificaciones: lote.notificacionesHabilitado,
    });
    if (loteErr) return { ok: false, error: loteErr.message };

    if (registros.length > 0) {
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

      const { error: regErr } = await s.rpc("agregar_registros_lote", {
        p_lote_id: lote.id,
        p_registros: batch,
      });
      if (regErr) return { ok: false, error: regErr.message };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function getLotesGestionDB(): Promise<LoteGestionRow[]> {
  try {
    const s = requireSupabase();
    const { data: lotes } = await s
      .from("lotes")
      .select("*")
      .neq("estado", "eliminado")
      .order("created_at", { ascending: false });
    if (!lotes) return [];

    const { data: allRegs } = await s
      .from("lote_registros")
      .select("lote_id, estado, monto, monto_pagado");
    const regs = allRegs ?? [];

    return lotes.map((l) => {
      const lr = regs.filter((r) => r.lote_id === l.id);
      const cobrados = lr.filter((r) => r.estado === "pagado_total").length;
      const parciales = lr.filter((r) => r.estado === "pagado_parcial").length;
      const pendientes = lr.filter((r) => r.estado === "pendiente" || r.estado === "vencido").length;
      const montoTotal = lr.reduce((s, r) => s + Number(r.monto), 0);
      const montoCobrado = lr.reduce((s, r) => s + Number(r.monto_pagado), 0);
      return {
        id: l.id,
        nombre: l.nombre,
        periodo: l.periodo,
        createdAt: l.created_at,
        fechaFinalizacion: l.fecha_finalizacion,
        estado: l.estado as LoteEstado,
        progreso: montoTotal > 0 ? Math.round((montoCobrado / montoTotal) * 100) : 0,
        cantidadPagos: cobrados,
        cantidadParciales: parciales,
        cantidadPendientes: pendientes,
        montoTotal,
        montoCobrado,
        montoPorCobrar: montoTotal - montoCobrado,
      };
    });
  } catch {
    return [];
  }
}

export async function getLoteByIdDB(id: string): Promise<Lote | null> {
  try {
    const s = requireSupabase();
    console.log("[getLoteByIdDB] querying id:", id);
    const { data, error } = await s.from("lotes").select("*").eq("id", id).maybeSingle();
    if (error) { console.error("[getLoteByIdDB] Supabase error:", error.message, error); return null; }
    console.log("[getLoteByIdDB] result:", data);
    return data ? rowToLote(data) : null;
  } catch (e) {
    console.error("[getLoteByIdDB] Exception:", e);
    return null;
  }
}

export async function getRegistrosByLoteIdDB(loteId: string): Promise<RegistroDeLote[]> {
  try {
    const s = requireSupabase();
    console.log("[getRegistrosByLoteIdDB] querying loteId:", loteId);
    const { data, error } = await s
      .from("lote_registros")
      .select("*")
      .eq("lote_id", loteId)
      .order("created_at", { ascending: true });
    if (error) { console.error("[getRegistrosByLoteIdDB] Supabase error:", error.message, error); return []; }
    console.log("[getRegistrosByLoteIdDB] result count:", (data ?? []).length, "first:", data?.[0]);
    return (data ?? []).map(rowToRegistro);
  } catch (e) {
    console.error("[getRegistrosByLoteIdDB] Exception:", e);
    return [];
  }
}

export async function iniciarLoteDB(
  loteId: string,
  legajo: string,
  force = false,
): Promise<{ ok: boolean; error?: string; linksCount: number }> {
  try {
    const s = requireSupabase();

    console.log("[iniciarLoteDB] loteId:", loteId, "legajo:", legajo, "force:", force);

    const { data: lote, error: loteErr } = await s
      .from("lotes")
      .select("medios_pago, pagos_parciales")
      .eq("id", loteId)
      .single();
    if (loteErr || !lote) { console.error("[iniciarLoteDB] lote query error:", loteErr); return { ok: false, error: loteErr?.message ?? "Lote not found", linksCount: 0 }; }

    const mediosPago = parseJsonbArray(lote.medios_pago) as string[];
    const pagosParciales = lote.pagos_parciales ?? false;

    if (lote.estado !== "en_proceso") {
      const { error: e1 } = await s.rpc("actualizar_estado_lote", {
        p_lote_id: loteId,
        p_estado: "en_proceso",
      });
      if (e1) { console.error("[iniciarLoteDB] estado error:", e1); return { ok: false, error: e1.message, linksCount: 0 }; }
    }

    const { data: regs, error: regQueryErr } = await s
      .from("lote_registros")
      .select("id, monto, descripcion, identificacion_usuario, link_de_pago")
      .eq("lote_id", loteId);
    if (regQueryErr) { console.error("[iniciarLoteDB] regs query error:", regQueryErr); return { ok: false, error: regQueryErr.message, linksCount: 0 }; }
    if (!regs || regs.length === 0) return { ok: true, linksCount: 0 };

    console.log("[iniciarLoteDB] total registros:", regs.length, "estados:", regs.map(r => r.link_de_pago ? "con_link" : "sin_link").join(","));

    if (force) {
      const regIds = regs.map((r) => r.id);
      if (regIds.length > 0) {
        const { error: clrErr, count } = await s
          .from("lote_registros")
          .update({ link_de_pago: null }, { count: "exact" })
          .in("id", regIds);
        if (clrErr) console.error("[iniciarLoteDB] force clear error:", clrErr);
        else console.log("[iniciarLoteDB] force cleared:", count, "rows");
        regs.forEach((r) => { r.link_de_pago = null; });
      }
    }

    const regsSinLink = regs.filter((r) => !r.link_de_pago);
    console.log("[iniciarLoteDB] sin link:", regsSinLink.length);

    if (regsSinLink.length === 0) return { ok: true, linksCount: 0 };

    // URL resoluble: VITE_APP_URL > VITE_PAY_URL > window.location.origin (ver @/lib/pay-url).
    const linkRows = regsSinLink.map((r) => {
      const code = "LP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      return {
        cliente_legajo: legajo,
        comercio_nombre: r.descripcion || r.identificacion_usuario,
        url: buildResolvableUrl(code),
        monto: Number(r.monto),
        estado: "Activo",
        metodos_pago: mediosPago.length > 0 ? mediosPago : ["TRANSFERENCIA"],
        pagos_parciales: pagosParciales,
      };
    });

    console.log("[iniciarLoteDB] inserting", linkRows.length, "links into cliente_links_pago, legajo:", legajo);
    const { data: inserted, error: e2 } = await s
      .from("cliente_links_pago")
      .insert(linkRows)
      .select("id, url");
    if (e2) { console.error("[iniciarLoteDB] links insert error:", JSON.stringify(e2)); return { ok: false, error: e2.message, linksCount: 0 }; }

    console.log("[iniciarLoteDB] links creados:", inserted.length, "urls:", inserted.map(i => i.url));

    const { data: verifyRow, error: verifyErr } = await s
      .from("cliente_links_pago")
      .select("id, url")
      .eq("url", inserted[0]?.url)
      .maybeSingle();
    console.log("[iniciarLoteDB] verify link exists:", !!verifyRow, "error:", verifyErr?.message);

    let linkUpdatesOk = 0;
    for (let i = 0; i < inserted.length; i++) {
      const { error: linkErr } = await s.rpc("actualizar_link_registro", {
        p_registro_id: regsSinLink[i].id,
        p_link: inserted[i].url,
      });
      if (linkErr) console.error("[iniciarLoteDB] actualizar_link error:", linkErr);
      else linkUpdatesOk++;
    }
    console.log("[iniciarLoteDB] link updates:", linkUpdatesOk, "of", inserted.length);

    // Crear detalle snapshot (equivalente a Productos) para que el checkout /p/{CODE} muestre monto/producto
    // No afecta a links individuales; solo complementa los de lote
    try {
      const detalleRows = inserted.map((link, idx) => ({
        link_id: link.id,
        producto_id: null,
        producto_nombre: regsSinLink[idx].descripcion || regsSinLink[idx].identificacion_usuario || "Cobro lote",
        cantidad: 1,
        precio_unitario: Number(regsSinLink[idx].monto),
      }));
      const { error: detErr } = await s.from("cliente_links_pago_detalle").insert(detalleRows);
      if (detErr) console.error("[iniciarLoteDB] detalle insert error:", JSON.stringify(detErr));
      else console.log("[iniciarLoteDB] detalle rows created:", detalleRows.length);
    } catch (e) {
      console.error("[iniciarLoteDB] detalle exception:", e);
    }

    return { ok: true, linksCount: inserted.length };
  } catch (e) {
    console.error("[iniciarLoteDB] Exception:", e);
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

export async function computeDashboardKPI(filter: PeriodFilter): Promise<DashboardKPI> {
  try {
    const s = requireSupabase();
    const fromIso = filter.from.toISOString();
    const toIso = filter.to.toISOString();
    const { data: lotes } = await s.from("lotes").select("id, estado").neq("estado", "eliminado").gte("created_at", fromIso).lte("created_at", toIso);
    const lotesArr = lotes ?? [];
    const loteIds = lotesArr.map((l) => l.id);
    if (loteIds.length === 0) return { totalLotes: 0, enProceso: 0, finalizados: 0, conError: 0, montoTotal: 0, montoCobrado: 0, montoPendiente: 0 };
    const { data: regs } = await s.from("lote_registros").select("lote_id, monto, monto_pagado").in("lote_id", loteIds);
    const regsArr = regs ?? [];
    const montoTotal = regsArr.reduce((s, r) => s + Number(r.monto), 0);
    const montoCobrado = regsArr.reduce((s, r) => s + Number(r.monto_pagado), 0);
    return {
      totalLotes: lotesArr.length,
      enProceso: lotesArr.filter((l) => l.estado === "en_proceso").length,
      finalizados: lotesArr.filter((l) => l.estado === "finalizado").length,
      conError: lotesArr.filter((l) => l.estado === "error").length,
      montoTotal,
      montoCobrado,
      montoPendiente: montoTotal - montoCobrado,
    };
  } catch {
    return { totalLotes: 0, enProceso: 0, finalizados: 0, conError: 0, montoTotal: 0, montoCobrado: 0, montoPendiente: 0 };
  }
}

export interface MedioPagoData { medio: string; monto: number; cantidad: number; porcentaje: number; }

export async function computePorMedio(_filter: PeriodFilter): Promise<MedioPagoData[]> {
  // Placeholder: requires pagos table or payment data. Return empty for now.
  return [];
}

export interface VencimientoData { label: string; cantidad: number; monto: number; }

export async function computePorVencimiento(_filter: PeriodFilter): Promise<VencimientoData[]> {
  return [{ label: "1er vencimiento", cantidad: 0, monto: 0 }, { label: "2do vencimiento", cantidad: 0, monto: 0 }, { label: "3er vencimiento", cantidad: 0, monto: 0 }];
}

export interface NoCobradasData { totalOperaciones: number; vencidas: number; vigentes: number; montoNoCobrado: number; porcentajeNoCobrado: number; }

export async function computeNoCobradas(filter: PeriodFilter): Promise<NoCobradasData> {
  try {
    const s = requireSupabase();
    const fromIso = filter.from.toISOString();
    const toIso = filter.to.toISOString();
    const { data: lotes } = await s.from("lotes").select("id").neq("estado", "eliminado").gte("created_at", fromIso).lte("created_at", toIso);
    const loteIds = (lotes ?? []).map((l) => l.id);
    if (loteIds.length === 0) return { totalOperaciones: 0, vencidas: 0, vigentes: 0, montoNoCobrado: 0, porcentajeNoCobrado: 0 };
    const { data: regs } = await s.from("lote_registros").select("estado, monto, monto_pagado").in("lote_id", loteIds);
    const regsArr = regs ?? [];
    const noCobradas = regsArr.filter((r) => r.estado !== "pagado_total");
    const montoTotal = regsArr.reduce((s, r) => s + Number(r.monto), 0);
    const montoNoCobrado = noCobradas.reduce((s, r) => s + (Number(r.monto) - Number(r.monto_pagado)), 0);
    return {
      totalOperaciones: regsArr.length,
      vencidas: noCobradas.filter((r) => r.estado === "vencido").length,
      vigentes: noCobradas.filter((r) => r.estado !== "vencido").length,
      montoNoCobrado,
      porcentajeNoCobrado: montoTotal > 0 ? Math.round((montoNoCobrado / montoTotal) * 100) : 0,
    };
  } catch {
    return { totalOperaciones: 0, vencidas: 0, vigentes: 0, montoNoCobrado: 0, porcentajeNoCobrado: 0 };
  }
}

export interface EvolucionData { fecha: string; monto: number; cantidad: number; }

export async function computeEvolucion(_filter: PeriodFilter): Promise<EvolucionData[]> {
  // Placeholder: requires pagos table with timestamps. Return empty for now.
  return [];
}

export interface LoteResumen { id: string; nombre: string; estado: LoteEstado; progreso: number; montoTotal: number; montoCobrado: number; cantidadPagos: number; cantidadParciales: number; cantidadPendientes: number; createdAt: string; }

export async function computeLotesRecientes(filter: PeriodFilter): Promise<LoteResumen[]> {
  try {
    const s = requireSupabase();
    const fromIso = filter.from.toISOString();
    const toIso = filter.to.toISOString();
    const { data: lotes } = await s.from("lotes").select("*").neq("estado", "eliminado").gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false });
    const lotesArr = lotes ?? [];
    if (lotesArr.length === 0) return [];
    const loteIds = lotesArr.map((l) => l.id);
    const { data: regs } = await s.from("lote_registros").select("lote_id, estado, monto, monto_pagado").in("lote_id", loteIds);
    const regsArr = regs ?? [];
    return lotesArr.map((l) => {
      const lr = regsArr.filter((r) => r.lote_id === l.id);
      const montoTotal = lr.reduce((s, r) => s + Number(r.monto), 0);
      const montoCobrado = lr.reduce((s, r) => s + Number(r.monto_pagado), 0);
      return {
        id: l.id,
        nombre: l.nombre,
        estado: l.estado as LoteEstado,
        progreso: montoTotal > 0 ? Math.round((montoCobrado / montoTotal) * 100) : 0,
        montoTotal,
        montoCobrado,
        cantidadPagos: lr.filter((r) => r.estado === "pagado_total").length,
        cantidadParciales: lr.filter((r) => r.estado === "pagado_parcial").length,
        cantidadPendientes: lr.filter((r) => r.estado === "pendiente" || r.estado === "vencido").length,
        createdAt: l.created_at,
      };
    });
  } catch {
    return [];
  }
}
