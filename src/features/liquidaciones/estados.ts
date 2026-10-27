import type { TicketEstado } from "@/lib/api/liquidaciones";
import type { CalendarioAcreditacion } from "@/lib/api/calendario-acreditaciones";

export type Tono = "neutral" | "success" | "warn" | "danger";

export const ESTADO_TICKET_LABEL: Record<TicketEstado, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  cancelado: "Cancelado",
  rechazado: "Rechazado",
  acreditado: "Acreditado",
};

export const ESTADO_TICKET_TONE: Record<TicketEstado, Tono> = {
  pendiente: "warn",
  aprobado: "success",
  cancelado: "neutral",
  rechazado: "danger",
  acreditado: "success",
};

/** Colores de cada lote en la grilla del calendario, según su estado calculado. */
export const ESTADO_CAL_COLORS: Record<
  CalendarioAcreditacion["estadoCalculado"],
  { bg: string; text: string; label: string; border: string }
> = {
  programado: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    border: "border-blue-300",
    label: "Programado",
  },
  pendiente: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-300",
    label: "Pendiente",
  },
  acreditado: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-300",
    label: "Acreditado",
  },
  contracargo: {
    bg: "bg-danger-100",
    text: "text-danger-700",
    border: "border-danger-300",
    label: "Contracargo",
  },
  cancelado: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-300",
    label: "Cancelado",
  },
};

/** Tono del badge de estado de un impuesto o comisión ("Activo" / otro). */
export const tonoEstadoImpuesto = (estado: string): Tono =>
  estado === "Activo" ? "warn" : "neutral";
export const tonoEstadoComision = (estado: string): Tono =>
  estado === "Activo" ? "success" : "neutral";
