import type { EstadoMov, TipoLinea } from "./utils";

export type Tono = "neutral" | "success" | "warn" | "danger";

export const ESTADO_MOV_TONE: Record<EstadoMov, Tono> = {
  Acreditado: "success",
  Pendiente: "warn",
  Rechazado: "danger",
};

/** Clases del chip de tipo de linea en la tabla. */
export const TIPO_LINEA_STYLE: Record<TipoLinea, string> = {
  ingreso: "bg-emerald-50 text-emerald-700 border-emerald-200",
  egreso: "bg-danger-50 text-danger-700 border-danger-200",
  comision: "bg-amber-50 text-amber-700 border-amber-200",
  impuesto: "bg-violet-50 text-violet-700 border-violet-200",
  interes: "bg-sky-50 text-sky-700 border-sky-200",
  reverso: "bg-slate-100 text-slate-700 border-slate-300",
};
