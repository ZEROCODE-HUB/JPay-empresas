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
  cobro_pct: "Cobro QR / Punto de venta",
  retiro: "Retiro",
  pago_pct: "Pago QR",
  tarjeta: "Cobro con tarjeta",
  liquidacion_lote: "Liquidación de lote",
  acreditacion_lote: "Acreditación de lote",
  adelanto: "Adelanto",
  ajuste_manual: "Ajuste de saldo",
};

/** Tipos de transacción que restan saldo a la subcuenta. */
export const TIPOS_EGRESO = ["transferencia", "retiro", "pago_pct"];
