export type Tab = "unica" | "programar" | "borradores" | "programadas" | "destinatarios";

/** Destinatario validado contra el banco (o tomado de agenda/plantilla). */
export type CoelsaResult = {
  nombre: string;
  cuit: string;
  cbu: string;
  alias: string;
  /** Detalle extra que devuelve el banco al validar; puede venir vacío. */
  banco?: string;
  bancoCodigo?: string;
  tipoCuenta?: string;
  moneda?: string;
  activa?: boolean;
  tipoPersona?: string;
  tipoDoc?: string;
};
export type Destinatario = CoelsaResult & { banco: string };

export type TransferPayload = {
  subcuentaOrigen: string;
  destinatarioCbu: string;
  destinatarioCuit: string;
  destinatarioNombre: string;
  destinatarioAlias: string;
  /** Destinatario completo (detalle que devolvió el banco) para el comprobante. */
  destinatario?: CoelsaResult;
  monto: number;
  concepto: string;
};

export type TransferSuccess = {
  txid: string;
  estado?: string;
  mensaje?: string;
  /** Comprobante de la operación (se completa al enviar). */
  monto?: number;
  concepto?: string;
  origenNombre?: string;
  origenCbu?: string;
  destino?: string;
  comision?: number;
  impuesto?: number;
  fecha?: string;
};

export type Subcuenta = {
  id: string;
  nombre: string;
  cbu: string | null;
  saldo_disponible: number;
  tipo: string;
};

/** Datos editables de una plantilla (crear/editar desde el modal). */
export type PlantillaInput = {
  nombre: string;
  monto?: number;
  subcuentaOrigen?: string;
  concepto?: string;
};
