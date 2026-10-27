import type { EstadoClienteNuevo } from "@/lib/cliente-estados";

export type Tono = "neutral" | "success" | "warn" | "danger";

/** Tono del badge "Estado" de la ficha (difiere de `ESTADO_TONE`: registrado va en warn). */
export const ESTADO_CUENTA_TONE: Record<EstadoClienteNuevo, Tono> = {
  pendiente_verificacion: "warn",
  registrado: "warn",
  preactivado: "warn",
  activado: "success",
  suspendido: "danger",
  deshabilitado: "neutral",
  eliminado: "danger",
};

export const TIPO_DOC_LABEL: Record<string, string> = {
  id_frente: "DNI Frente",
  id_dorso: "DNI Dorso",
  servicio: "Comprobante de servicio",
  selfie: "Selfie con DNI",
};
