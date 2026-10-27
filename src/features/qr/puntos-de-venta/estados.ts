import type { EstadoPdv } from "@/lib/api/qr";

export type Tono = "success" | "warn";

/** Tono del badge de estado de un punto de venta (solo "Activado" va en verde). */
export const tonoEstadoPdv = (estado: EstadoPdv): Tono =>
  estado === "Activado" ? "success" : "warn";

/** Opciones del filtro de estado (incluye "Todos"). */
export const ESTADOS_FILTRO = [
  "Todos",
  "Activado",
  "Desactivado",
  "Pendiente de aprobación",
] as const;
