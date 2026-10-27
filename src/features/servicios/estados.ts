import type { EstadoPagoServicio, EstadoRemesa, EstadoServicio } from "./types";

export type Tono = "neutral" | "success" | "warn" | "danger";

/** Tono del badge de un servicio suscrito. */
export const ESTADO_SERVICIO_TONE: Record<EstadoServicio, Tono> = {
  Vencido: "danger",
  Pendiente: "warn",
  Proximo: "neutral",
};

/** Tono del badge en "Próximos pagos": si ya venció (por fecha) manda sobre el estado. */
export const tonoProximoPago = (vencido: boolean, e: EstadoServicio): Tono =>
  vencido ? "danger" : e === "Pendiente" ? "warn" : "neutral";

export const ESTADO_PAGO_TONE: Record<EstadoPagoServicio, Tono> = {
  Pagado: "success",
  Cancelado: "neutral",
  Vencido: "danger",
};

export const ESTADO_REMESA_TONE: Record<EstadoRemesa, Tono> = {
  Completado: "success",
  "En proceso": "warn",
  Rechazado: "danger",
};
