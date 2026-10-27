import { requireSupabase } from "@/lib/supabase";
import type { Database, Tables } from "@/lib/database.types";
import { formatDateShort } from "@/shared/format";
import { getResumenSaldosCalendario } from "./calendario-acreditaciones";
import { getEmailUsuarioActual } from "./auth";
import { DataAccessError } from "./errors";

// ============================================================================
// Tipos
// ============================================================================

export type TicketEstado = "pendiente" | "aprobado" | "cancelado" | "rechazado" | "acreditado";
export type Ticket = {
  id: string;
  fullId?: string;
  fecha: string;
  montoSolicitado: number;
  montoPorAcreditar: number;
  fechaAcreditacion: string;
  estado: TicketEstado;
  motivo?: string;
  tasaInteres?: number | null;
  plazoAdelantado?: number | null;
};

export type DiaAcreditacion = {
  date: string; // YYYY-MM-DD
  label: string; // DD/MM
  monto: number;
  cantidad: number;
};

export type LoteVenta = {
  id: string;
  fecha: string;
  bandera: string;
  cantidadOperaciones: number;
  montoOperaciones: number;
  comision: number;
  impuesto: number;
  montoCobrado: number;
};

export type LoteAcredDetalle = {
  id: string;
  fullId?: string;
  fecha: string;
  fechaAcreditacion?: string;
  fechaCobroReal?: string | null;
  bandera: string;
  cantidadOperaciones: number;
  importeNeto: number;
  comisionCierrePct: number | null;
  comisionCierreMonto: number | null;
  estado?: string;
};

export type ComisionBandera = {
  bandera: string;
  cuotas: number;
  tasaMensual: number;
  estado: string;
};

export type Impuesto = {
  id: string;
  codigo: string;
  descripcion: string;
  tipo: string;
  alicuota: number;
  estado: string;
};

export type Excepcion = {
  impuestoCodigo: string;
  motivo: string;
  estado: string;
  vigenciaHasta: string | null;
};

/** Comercio del usuario logueado (las RLS no siempre filtran por usuario). */
export type ComercioLiquidaciones = {
  legajo: string | null;
  cuit: string | null;
  comercioId: string | null;
};

export type LiquidacionesDatos = {
  faltaCobrar: number;
  porAcreditar: number;
  adelantosEnCurso: number;
  disponible: number;
  /** Próximas acreditaciones (lotes pendientes) por día, ascendente. */
  dias: DiaAcreditacion[];
  tickets: Ticket[];
  lotesVenta: LoteVenta[];
  /** Lotes ya acreditados. */
  lotesAcreditados: LoteAcredDetalle[];
  comisiones: ComisionBandera[];
  impuestos: Impuesto[];
  excepciones: Excepcion[];
};

export const LIQUIDACIONES_VACIAS: LiquidacionesDatos = {
  faltaCobrar: 0,
  porAcreditar: 0,
  adelantosEnCurso: 0,
  disponible: 0,
  dias: [],
  tickets: [],
  lotesVenta: [],
  lotesAcreditados: [],
  comisiones: [],
  impuestos: [],
  excepciones: [],
};

export type AdelantoRow = Database["public"]["Functions"]["ingresar_adelanto"]["Returns"];

// v_lotes_venta no expone todas las columnas que lee la pantalla; las que
// faltan quedan undefined y caen al valor por defecto.
type VLoteVentaRow = Tables<"v_lotes_venta"> & {
  id?: string | null;
  cantidad?: number | null;
  monto_operaciones?: number | null;
  monto?: number | null;
  impuesto?: number | null;
  monto_cobrado?: number | null;
};

type ImpuestoRow = Pick<
  Tables<"impuestos">,
  "id" | "codigo" | "descripcion" | "tipo" | "estado"
> & {
  alicuota?: number | null;
};

// ============================================================================
// Lecturas
// ============================================================================

export async function getComercioLiquidaciones(): Promise<ComercioLiquidaciones> {
  const sb = requireSupabase();
  const mail = await getEmailUsuarioActual();
  let legajo: string | null = null;
  let cuit: string | null = null;
  let comercioId: string | null = null;
  if (mail) {
    const { data: cli } = await sb
      .from("clientes")
      .select("legajo, cuit")
      .eq("correo", mail)
      .maybeSingle();
    legajo = cli?.legajo ?? null;
    cuit = cli?.cuit ?? null;

    if (legajo) {
      const { data: com } = await sb
        .from("comercios")
        .select("id")
        .eq("legajo", legajo)
        .maybeSingle();
      comercioId = com?.id ?? null;
    }
  }
  return { legajo, cuit, comercioId };
}

/**
 * Todo lo que muestra la pantalla de liquidaciones. Como antes, los errores de
 * cada consulta se ignoran y esa sección queda vacía.
 */
export async function getLiquidacionesDatos({
  comercioId,
  cuit,
}: Pick<ComercioLiquidaciones, "comercioId" | "cuit">): Promise<LiquidacionesDatos> {
  const sb = requireSupabase();

  // 1) Falta cobrar: RPC `calendario_resumen_saldos` (suma de lotes_venta sin lote_acreditacion).
  let falta = 0;
  let adelantosEnCursoCalc = 0;
  if (comercioId) {
    try {
      falta = (await getResumenSaldosCalendario(comercioId)).faltaCobrar;
    } catch (e) {
      console.warn("calendario_resumen_saldos no disponible, fallback:", e);
    }
  }

  // 2) Lotes de acreditación del comercio: pendientes (calendario) vs Acreditados (historial).
  let acreditar = 0;
  let disp = 0;
  const ticketsReal: Ticket[] = [];
  const porDia: Record<string, { monto: number; cantidad: number }> = {};
  let acredListado: LoteAcredDetalle[] = [];

  if (comercioId) {
    const { data: loteRows } = await sb
      .from("lotes_acreditacion")
      .select(
        "id, fecha, cantidad_operaciones, importe_neto, estado, comision_cierre_lote_pct, comision_cierre_lote_monto, bandera, fecha_resolucion, fecha_cobro_real",
      )
      .eq("comercio_id", comercioId);

    const rows = loteRows ?? [];
    const pendientes = rows.filter(
      (l) => l.estado !== "Acreditado" && l.estado !== "Rechazado" && l.estado !== "Cancelado",
    );
    acreditar = pendientes.reduce((s, l) => s + Number(l.importe_neto ?? 0), 0);

    acredListado = rows
      .map((l) => ({
        id: String(l.id).slice(0, 8).toUpperCase(),
        fullId: l.id,
        fecha: (l.fecha ?? "").slice(0, 10),
        fechaAcreditacion:
          l.fecha_resolucion != null ? new Date(l.fecha_resolucion).toISOString().slice(0, 10) : "",
        fechaCobroReal: l.fecha_cobro_real ?? null,
        bandera: l.bandera ?? "—",
        cantidadOperaciones: Number(l.cantidad_operaciones ?? 0),
        importeNeto: Number(l.importe_neto ?? 0),
        comisionCierrePct:
          l.comision_cierre_lote_pct != null ? Number(l.comision_cierre_lote_pct) : null,
        comisionCierreMonto:
          l.comision_cierre_lote_monto != null ? Number(l.comision_cierre_lote_monto) : null,
        estado: l.estado,
      }))
      .filter((l) => l.estado === "Acreditado");

    pendientes.forEach((l) => {
      const fecha = (l.fecha ?? "").slice(0, 10);
      if (!fecha) return;
      if (!porDia[fecha]) porDia[fecha] = { monto: 0, cantidad: 0 };
      porDia[fecha].monto += Number(l.importe_neto ?? 0);
      porDia[fecha].cantidad += Number(l.cantidad_operaciones ?? 0);
    });

    // 3) Adelantos del propio comercio.
    const { data: adelRows } = await sb
      .from("adelantos")
      .select(
        "id, monto_solicitado, monto_por_acreditar, fecha_acreditacion, estado, motivo, fecha_solicitud, created_at, tasa_interes_pct, plazo_adelantado_dias, fecha_resolucion",
      )
      .eq("comercio_id", comercioId);
    const adelantos = adelRows ?? [];

    // "Disponible para adelanto": RPC `fn_calcular_tope_disponible`; si no
    // existe todavía, se calcula en JS para no romper la pantalla.
    try {
      const { data: topeRpc, error: rpcError } = await sb.rpc("fn_calcular_tope_disponible", {
        p_comercio_id: comercioId,
      });
      if (!rpcError) {
        disp = Math.max(0, Number(topeRpc ?? 0));
      } else {
        throw new Error(rpcError.message);
      }
    } catch {
      const reservado = adelantos.reduce(
        (s, a) =>
          s +
          (a.estado === "Pendiente" || a.estado === "Aprobado"
            ? Number(a.monto_solicitado ?? 0)
            : 0),
        0,
      );
      disp = Math.max(0, acreditar - reservado);
    }

    ticketsReal.push(
      ...adelantos.map((r) => ({
        id: String(r.id).slice(0, 8).toUpperCase(),
        fullId: r.id,
        fecha: (r.fecha_solicitud ?? r.created_at ?? "").slice(0, 10),
        montoSolicitado: Number(r.monto_solicitado ?? 0),
        montoPorAcreditar: Number(r.monto_por_acreditar ?? 0),
        fechaAcreditacion: (r.fecha_acreditacion ?? "").slice(0, 10),
        estado: (r.estado ?? "pendiente").toLowerCase() as TicketEstado,
        motivo: r.motivo ?? undefined,
        tasaInteres: r.tasa_interes_pct != null ? Number(r.tasa_interes_pct) : null,
        plazoAdelantado: r.plazo_adelantado_dias != null ? Number(r.plazo_adelantado_dias) : null,
      })),
    );
    // Σ adelantos en curso (Pendiente + Aprobado)
    adelantosEnCursoCalc = adelantos
      .filter((r) => r.estado === "Pendiente" || r.estado === "Aprobado")
      .reduce((s, r) => s + Number(r.monto_por_acreditar ?? r.monto_solicitado ?? 0), 0);
  }

  // 4) Lotes de venta. Sin comercio no se filtra.
  let ventaRows: LoteVenta[] = [];
  try {
    let q = sb.from("v_lotes_venta").select("*").order("fecha", { ascending: false });
    if (comercioId) q = q.eq("comercio_id", comercioId);
    const { data: vRows } = await q;
    ventaRows = ((vRows ?? []) as VLoteVentaRow[]).map((r) => ({
      id: String(r.id ?? "")
        .slice(0, 8)
        .toUpperCase(),
      fecha: (r.fecha ?? "").slice(0, 10),
      bandera: r.bandera ?? "—",
      cantidadOperaciones: Number(r.cantidad_operaciones ?? r.cantidad ?? 0),
      montoOperaciones: Number(r.monto_operaciones ?? r.monto ?? 0),
      comision: Number(r.comision ?? 0),
      impuesto: Number(r.impuesto ?? 0),
      montoCobrado: Number(r.monto_cobrado ?? 0),
    }));
  } catch {
    // v_lotes_venta puede no existir aún; se muestra vacío
  }

  // 5) Comisiones por bandera y cuota.
  let comisionesData: ComisionBandera[] = [];
  try {
    const { data: cbRows } = comercioId
      ? await sb
          .from("comercio_banderas")
          .select("id, bandera, estado")
          .eq("comercio_id", comercioId)
      : { data: null };
    if (cbRows && cbRows.length > 0) {
      const cbIds = cbRows.map((r) => r.id);
      const { data: cuotasRows } = await sb
        .from("comercio_banderas_cuotas")
        .select("comercio_bandera_id, cuotas, tasa_mensual, estado")
        .in("comercio_bandera_id", cbIds);
      const banderaMap = new Map(cbRows.map((r) => [r.id, r.bandera]));
      comisionesData = (cuotasRows ?? []).map((c) => ({
        bandera: banderaMap.get(c.comercio_bandera_id) ?? "—",
        cuotas: Number(c.cuotas ?? 0),
        tasaMensual: Number(c.tasa_mensual ?? 0),
        estado: c.estado ?? "Activo",
      }));
    }
  } catch {
    // Tablas aún no creadas
  }

  // 6) Impuestos externos + excepciones del comercio
  let impuestosData: Impuesto[] = [];
  let excepcionesData: Excepcion[] = [];
  try {
    const { data: impRows } = await sb
      .from("impuestos")
      .select("id, codigo, descripcion, tipo, alicuota, estado, ambito")
      .eq("ambito", "Externo")
      .eq("estado", "Activo");
    impuestosData = ((impRows ?? []) as unknown as ImpuestoRow[]).map((r) => ({
      id: r.id,
      codigo: r.codigo ?? "",
      descripcion: r.descripcion ?? "",
      tipo: r.tipo ?? "",
      alicuota: Number(r.alicuota ?? 0),
      estado: r.estado ?? "Activo",
    }));

    if (cuit) {
      const { data: excRows } = await sb
        .from("dc_excepciones")
        .select("tipo, motivo, estado, vigencia_hasta, impuesto_id")
        .eq("cuit", cuit)
        .eq("estado", "Activo");
      const impIdToCodigo = new Map(impuestosData.map((i) => [i.id, i.codigo]));
      excepcionesData = (excRows ?? []).map((r) => ({
        impuestoCodigo:
          (r.impuesto_id ? impIdToCodigo.get(r.impuesto_id) : undefined) ?? r.tipo ?? "—",
        motivo: r.motivo ?? r.tipo ?? "Exención",
        estado: r.estado ?? "Activo",
        vigenciaHasta: r.vigencia_hasta ?? null,
      }));
    }
  } catch {
    // Tablas aún no disponibles
  }

  const dias: DiaAcreditacion[] = Object.entries(porDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      label: formatDateShort(date),
      monto: v.monto,
      cantidad: v.cantidad,
    }));

  return {
    faltaCobrar: falta,
    porAcreditar: acreditar,
    adelantosEnCurso: adelantosEnCursoCalc,
    disponible: disp,
    dias,
    tickets: ticketsReal,
    lotesVenta: ventaRows,
    lotesAcreditados: acredListado,
    comisiones: comisionesData,
    impuestos: impuestosData,
    excepciones: excepcionesData,
  };
}

// ============================================================================
// Adelantos
// ============================================================================

/** Alta con validación server-side (RPC security definer). */
export async function ingresarAdelanto(params: {
  monto: number;
  fechaAcreditacion: string;
  motivo?: string;
}): Promise<AdelantoRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("ingresar_adelanto", {
    monto: params.monto,
    fecha_acreditacion: params.fechaAcreditacion,
    motivo: params.motivo,
  });
  if (error) throw new DataAccessError(error);
  return data ?? null;
}

export async function cancelarAdelanto(adelantoId: string): Promise<AdelantoRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("cancelar_adelanto", { p_adelanto_id: adelantoId });
  if (error) throw new DataAccessError(error);
  return data ?? null;
}
