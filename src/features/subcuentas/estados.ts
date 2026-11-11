import type { EstadoSub, TipoSub } from "./types";

export type Tono = "neutral" | "success" | "warn" | "danger";

export const TIPOS_SUB: TipoSub[] = ["Operativa", "Recaudacion", "Garantias", "Sueldos"];

export const TIPO_LABEL: Record<TipoSub, string> = {
  Operativa: "Operativa",
  Recaudacion: "Recaudación",
  Garantias: "Garantías",
  Sueldos: "Sueldos",
};

export const ESTADO_SUB_TONE: Record<EstadoSub, Tono> = {
  Activa: "success",
  Pausada: "warn",
};

/** Título de cada tipo de transacción en el historial de la subcuenta. */
export const TITULO_MOV: Record<string, string> = {
  deposito: "Depósito",
  transferencia: "Transferencia",
  retiro: "Retiro",
  tarjeta: "Cobro con tarjeta",
  ajuste_manual: "Ajuste de saldo",
};

/** Título de cada categoría del asiento (función portal_detalle_subcuenta). */
export const TITULO_CATEGORIA: Record<string, string> = {
  deposito: "Depósito",
  envio_spei: "Transferencia SPEI",
  envio_usd: "Envío en dólares",
  conversion: "Conversión a dólares",
  interna: "Transferencia entre subcuentas",
  ajuste: "Ajuste de saldo",
  cobro_tarjeta: "Cobro con tarjeta",
  retiro: "Retiro",
};

/** Tipos de transacción que restan saldo a la subcuenta. */
export const TIPOS_EGRESO = ["transferencia", "retiro"];
