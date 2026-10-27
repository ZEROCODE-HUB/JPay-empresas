export type TipoSub = "Operativa" | "Recaudacion" | "Garantias" | "Sueldos";
export type EstadoSub = "Activa" | "Pausada";

/** Subcuenta tal como la usa la pantalla (mapeada desde `SubcuentaConSaldos`). */
export type Sub = {
  id?: string;
  n: string;
  apellido: string;
  email: string;
  cbu: string;
  tipo: TipoSub;
  e: EstadoSub;
  disp: number;
  ret: number;
  conc: number;
  ing: string;
  egr: string;
  resp: string;
  lim: string;
  color: string;
  retirosHab: boolean;
};

/** Movimiento de una subcuenta en el modal de detalle. */
export type Mov = {
  tipo: "ingreso" | "egreso";
  titulo: string;
  txid: string;
  cbu: string;
  entidad: string;
  fecha: string;
  hora: string;
  monto: number;
};

export type FiltroTipoMov = "todos" | "ingreso" | "egreso";

export type FormSubcuenta = {
  n: string;
  apellido: string;
  email: string;
  tipo: string;
  resp: string;
  lim: string;
  saldo: string;
  activar: boolean;
};
