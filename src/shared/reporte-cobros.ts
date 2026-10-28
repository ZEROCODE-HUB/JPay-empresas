/**
 * Reporte de cobros con proveedores externos (Ecart Pay): lectura del resultado de la RPC
 * `reporte_cobros_proveedor`, períodos predefinidos y filas para exportar.
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 */

export type ResumenCobros = {
  cantidad: number;
  cobrado: number;
  comision: number;
  neto: number;
  sinConciliar: number;
  reembolsado: number;
  reembolsos: number;
  contracargos: number;
  contracargosMonto: number;
  contracargosAbiertos: number;
  pendientes: number;
  pendientesMonto: number;
};

export type CobrosPorDia = {
  fecha: string;
  cantidad: number;
  monto: number;
  comision: number;
  reembolsado: number;
};

export type CobrosPorMetodo = {
  metodo: string;
  cantidad: number;
  monto: number;
  comision: number;
  reembolsado: number;
};

export type CobrosPorSucursal = {
  sucursalId: string | null;
  sucursal: string | null;
  cajaId: string | null;
  caja: string | null;
  cantidad: number;
  monto: number;
  comision: number;
};

export type CobrosPorComercio = {
  comercioId: string | null;
  comercio: string | null;
  cantidad: number;
  monto: number;
  comision: number;
  neto: number;
  reembolsado: number;
};

export type CobroDetalle = {
  id: string;
  pagadoAt: string;
  comercio: string | null;
  metodo: string;
  monto: number;
  comision: number | null;
  neto: number | null;
  reembolsado: number;
  sucursal: string | null;
  caja: string | null;
  pagador: string | null;
  orden: string | null;
};

export type ReporteCobros = {
  desde: string;
  hasta: string;
  timezone: string;
  resumen: ResumenCobros;
  porDia: CobrosPorDia[];
  porMetodo: CobrosPorMetodo[];
  porSucursal: CobrosPorSucursal[];
  porComercio: CobrosPorComercio[];
  detalle: CobroDetalle[];
};

/** Máximo de filas de detalle que devuelve la RPC. */
export const LIMITE_DETALLE = 5000;

export const METODOS_COBRO: Record<string, string> = {
  card: "Tarjeta",
  spei: "SPEI",
  oxxo: "OXXO",
  pos: "Terminal",
};

export const etiquetaMetodo = (m: string | null | undefined) =>
  METODOS_COBRO[m ?? "card"] ?? m ?? "Tarjeta";

/** Nombre del punto de cobro: los pagos sin caja son cobros en línea. */
export const etiquetaPunto = (sucursal: string | null, caja: string | null) =>
  sucursal ? (caja ? `${sucursal} · ${caja}` : sucursal) : "En línea (links de pago)";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Convierte el jsonb de `reporte_cobros_proveedor` (snake_case) al tipo del front. */
export function toReporteCobros(raw: unknown): ReporteCobros {
  const r = obj(raw);
  const s = obj(r.resumen);
  return {
    desde: str(r.desde) ?? "",
    hasta: str(r.hasta) ?? "",
    timezone: str(r.timezone) ?? "UTC",
    resumen: {
      cantidad: num(s.cantidad),
      cobrado: num(s.cobrado),
      comision: num(s.comision),
      neto: num(s.neto),
      sinConciliar: num(s.sin_conciliar),
      reembolsado: num(s.reembolsado),
      reembolsos: num(s.reembolsos),
      contracargos: num(s.contracargos),
      contracargosMonto: num(s.contracargos_monto),
      contracargosAbiertos: num(s.contracargos_abiertos),
      pendientes: num(s.pendientes),
      pendientesMonto: num(s.pendientes_monto),
    },
    porDia: arr(r.por_dia).map((d) => ({
      fecha: str(d.fecha) ?? "",
      cantidad: num(d.cantidad),
      monto: num(d.monto),
      comision: num(d.comision),
      reembolsado: num(d.reembolsado),
    })),
    porMetodo: arr(r.por_metodo).map((m) => ({
      metodo: str(m.metodo) ?? "card",
      cantidad: num(m.cantidad),
      monto: num(m.monto),
      comision: num(m.comision),
      reembolsado: num(m.reembolsado),
    })),
    porSucursal: arr(r.por_sucursal).map((x) => ({
      sucursalId: str(x.sucursal_id),
      sucursal: str(x.sucursal),
      cajaId: str(x.caja_id),
      caja: str(x.caja),
      cantidad: num(x.cantidad),
      monto: num(x.monto),
      comision: num(x.comision),
    })),
    porComercio: arr(r.por_comercio).map((c) => ({
      comercioId: str(c.comercio_id),
      comercio: str(c.comercio),
      cantidad: num(c.cantidad),
      monto: num(c.monto),
      comision: num(c.comision),
      neto: num(c.neto),
      reembolsado: num(c.reembolsado),
    })),
    detalle: arr(r.detalle).map((d) => ({
      id: str(d.id) ?? "",
      pagadoAt: str(d.pagado_at) ?? "",
      comercio: str(d.comercio),
      metodo: str(d.metodo) ?? "card",
      monto: num(d.monto),
      comision: numONull(d.comision),
      neto: numONull(d.neto),
      reembolsado: num(d.reembolsado),
      sucursal: str(d.sucursal),
      caja: str(d.caja),
      pagador: str(d.pagador),
      orden: str(d.orden),
    })),
  };
}

export type PeriodoCobros = "hoy" | "7d" | "30d" | "mes" | "mes_anterior";

export const PERIODOS_COBROS: { id: PeriodoCobros; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "mes", label: "Este mes" },
  { id: "mes_anterior", label: "Mes anterior" },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Fechas `desde`/`hasta` (YYYY-MM-DD, inclusive) de un período, contadas desde `hoy`. */
export function rangoPeriodo(p: PeriodoCobros, hoy = new Date()): { desde: string; hasta: string } {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const menos = (n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
  switch (p) {
    case "hoy":
      return { desde: iso(d), hasta: iso(d) };
    case "7d":
      return { desde: iso(menos(6)), hasta: iso(d) };
    case "30d":
      return { desde: iso(menos(29)), hasta: iso(d) };
    case "mes":
      return { desde: iso(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: iso(d) };
    case "mes_anterior":
      return {
        desde: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        hasta: iso(new Date(d.getFullYear(), d.getMonth(), 0)),
      };
  }
}

/** Filas del detalle para Excel (una por cobro). `conComercio` agrega la columna del comercio. */
export function filasDetalleCobros(
  detalle: CobroDetalle[],
  fecha: (iso: string) => string,
  conComercio = false,
): Record<string, string | number>[] {
  return detalle.map((d) => ({
    Fecha: fecha(d.pagadoAt),
    ...(conComercio ? { Comercio: d.comercio ?? "" } : {}),
    Medio: etiquetaMetodo(d.metodo),
    Punto: etiquetaPunto(d.sucursal, d.caja),
    Pagador: d.pagador ?? "",
    Monto: d.monto,
    Comision: d.comision ?? "",
    Neto: d.neto ?? "",
    Reembolsado: d.reembolsado,
    Orden: d.orden ?? "",
  }));
}
