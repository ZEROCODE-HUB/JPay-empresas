import { estadoCatalogo, type LoteEstado } from "@/lib/api/cobros-masivos";

/** Todos los estados de lote, en el orden del catálogo (para selects de filtro). */
export const ESTADOS_LOTE = Object.keys(estadoCatalogo) as LoteEstado[];

/** Etiqueta corta del estado de un lote (tablas, filtros, exportaciones). */
export const ESTADO_LOTE_LABEL: Record<LoteEstado, string> = {
  cargado: "Cargado / Pendiente",
  en_proceso: "En proceso",
  finalizado: "Finalizado",
  pausado: "Pausado",
  eliminado: "Eliminado",
  error: "Con error",
};

/** Badge del estado de un lote en gestión y en el detalle del lote. */
export const ESTADO_LOTE_BADGE: Record<LoteEstado, string> = {
  cargado: "bg-muted text-muted-foreground",
  en_proceso: "bg-amber-100 text-amber-800",
  finalizado: "bg-emerald-100 text-emerald-700",
  pausado: "bg-blue-100 text-blue-700",
  eliminado: "bg-danger-100 text-danger-700",
  error: "bg-danger-100 text-danger-700",
};

/** Badge del estado de un lote en la tabla de lotes recientes del dashboard. */
export const ESTADO_LOTE_BADGE_DASHBOARD: Record<LoteEstado, string> = {
  cargado: "bg-plata-200 text-black-600",
  en_proceso: "bg-warning-bg text-warning",
  finalizado: "bg-success-bg text-success",
  pausado: "bg-secondary-50 text-secondary-500",
  eliminado: "bg-error-bg text-error",
  error: "bg-error-bg text-error",
};

/** Etiqueta y estilo del estado de un registro (fila) de un lote. */
export const REGISTRO_ESTADO_BADGE: Record<string, { label: string; style: string }> = {
  pendiente: { label: "Pendiente", style: "bg-amber-100 text-amber-800" },
  pagado_total: { label: "Pagado", style: "bg-emerald-100 text-emerald-700" },
  pagado_parcial: { label: "Pago parcial", style: "bg-blue-100 text-blue-700" },
  vencido: { label: "Vencido", style: "bg-danger-100 text-danger-700" },
  error: { label: "Error", style: "bg-danger-100 text-danger-700" },
};
