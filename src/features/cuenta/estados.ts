import type { EstadoClienteNuevo } from "@/lib/cliente-estados";
import type { Plan } from "./types";

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

// Planes de ejemplo (todavía no salen de la base).
export const PLAN_EMPRESA: Plan = {
  nombre: "Plan Empresa",
  precio: "$ 48.000 / mes",
  ops: "5.000 operaciones incluidas",
  used: 3240,
  total: 5000,
};

export const PLAN_PERSONA: Plan = {
  nombre: "Plan Personal",
  precio: "$ 9.900 / mes",
  ops: "500 operaciones incluidas",
  used: 278,
  total: 500,
};
