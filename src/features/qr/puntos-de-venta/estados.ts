import type { EstadoPdv } from "@/lib/api/qr";

export type Tono = "success" | "warn";

/** Tono del badge de estado de un punto de venta (solo "Activado" va en verde). */
export const tonoEstadoPdv = (estado: EstadoPdv): Tono =>
  estado === "Activado" ? "success" : "warn";

/** Estado con el que se guarda siempre un PDV nuevo: lo aprueba el admin. */
export const ESTADO_ALTA_PDV: EstadoPdv = "Pendiente de aprobación";

/** Estado a enviar al guardar: en el alta siempre pendiente; en la edición, el elegido. */
export const estadoAGuardar = (editingId: string | null, estado: EstadoPdv): EstadoPdv =>
  editingId ? estado : ESTADO_ALTA_PDV;

/** Opciones del filtro de estado (incluye "Todos"). */
export const ESTADOS_FILTRO = [
  "Todos",
  "Activado",
  "Desactivado",
  "Pendiente de aprobación",
] as const;
