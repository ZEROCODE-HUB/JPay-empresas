import { brand } from "@/brand/brand";
import type { DatosComprobante } from "@/lib/comprobante";
import type { LineaMovimientoRow, OperacionRow } from "@/lib/api/movimientos";
import { formatDateTime, formatMoney } from "@/shared/format";

export type EstadoMov = "Acreditado" | "Pendiente" | "Rechazado";

export type Mov = {
  txid: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
  titular: string;
  cuit: string;
  cbuCvu: string;
  fecha: string;
  /** Fecha cruda (ISO) para el comprobante, que la formatea él mismo. */
  fechaISO: string;
  monto: number;
  comision: number;
  impuesto: number;
  estado: EstadoMov;
  medio: string;
  referencia: string;
  usuario: string;
  numeroOp: string;
  canal: "Web" | "API" | "Movil";
  subcuenta: string;
  senderName: string;
  senderCuit: string;
  senderCbu: string;
  receiverName: string;
  receiverCuit: string;
  receiverCbu: string;
  receiverBanco: string;
  /**
   * La contraparte del movimiento, sin importar el sentido: en un egreso es el
   * destinatario y en un ingreso es quien transfirio.
   */
  contraparteNombre: string;
  contraparteCuit: string;
  contraparteBanco: string;
  /** CBU/CVU de la cuenta PROPIA que intervino (la de origen en un egreso). */
  subcuentaCbu: string;
};

export type MovRow = {
  id_txn: string;
  tipo: string;
  cvu: string | null;
  monto_operacion: number;
  comision?: number | null;
  impuesto?: number | null;
  fecha: string | null;
  estado_codigo?: string;
  estado_nombre?: string;
  destinatario_nombre?: string | null;
  destinatario_cuit?: string | null;
  destinatario_banco?: string | null;
  /** Subcuenta del cliente que intervino (migracion 1020). */
  subcuenta_id?: string | null;
  subcuentas?: { cbu: string | null } | { cbu: string | null }[] | null;
  legajo: string;
};

export function prettyTipo(tipo: string): string {
  const map: Record<string, string> = {
    cobro_pct: "Cobros con QR",
    cobro_link: "Cobros con Tarjeta",
    deposito: "Ingresos",
    transferencia: "Egresos",
    retiro: "Egresos",
    comision: "Comisiones",
    // Operaciones internas registradas por el ledger.
    liquidacion_lote: "Liquidación de lote",
    acreditacion_lote: "Acreditación de lote",
    adelanto: "Adelanto",
    ajuste_manual: "Ajuste de saldo",
  };
  return map[tipo] ?? (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "Movimiento");
}

// APROBADO = la operacion se completo (lo usa el banco y nuestras RPC), asi que
// tambien cuenta como acreditado.
export function estadoVisible(nombreOCodigo: string | null | undefined): EstadoMov {
  const e = (nombreOCodigo ?? "Pendiente").toLowerCase();
  if (e.includes("acredit") || e.includes("aprob")) return "Acreditado";
  if (e.includes("rechaz")) return "Rechazado";
  return "Pendiente";
}

export function mapMov(r: MovRow): Mov {
  const tipo = /cobro|deposito|ingreso|liquidacion|acreditacion|adelanto/.test(r.tipo)
    ? "ingreso"
    : "egreso";
  const categoria = prettyTipo(r.tipo);
  const estado = estadoVisible(r.estado_nombre ?? r.estado_codigo);
  return {
    txid: r.id_txn,
    tipo,
    categoria,
    titular: r.legajo,
    cuit: "—",
    cbuCvu: r.cvu ?? "—",
    fecha: formatDateTime(r.fecha),
    fechaISO: r.fecha ?? "",
    monto: Number(r.monto_operacion) || 0,
    comision: Number(r.comision) || 0,
    impuesto: Number(r.impuesto) || 0,
    estado,
    medio: categoria,
    referencia: r.id_txn,
    usuario: "Sistema",
    numeroOp: r.id_txn,
    canal: "Web",
    subcuenta: "—",
    senderName: tipo === "ingreso" ? r.legajo : brand.name,
    senderCuit: "—",
    senderCbu: r.cvu ?? "—",
    receiverName: tipo === "ingreso" ? brand.name : (r.destinatario_nombre ?? ""),
    receiverCuit: tipo === "ingreso" ? "—" : (r.destinatario_cuit ?? ""),
    receiverCbu: r.cvu ?? "—",
    receiverBanco: tipo === "ingreso" ? "" : (r.destinatario_banco ?? ""),
    // Mismo dato sin importar el sentido: el comprobante lo usa para la contraparte.
    contraparteNombre: r.destinatario_nombre ?? "",
    contraparteCuit: r.destinatario_cuit ?? "",
    contraparteBanco: r.destinatario_banco ?? "",
    subcuentaCbu: (Array.isArray(r.subcuentas) ? r.subcuentas[0]?.cbu : r.subcuentas?.cbu) ?? "",
  };
}

/** Operacion de `getOperacion` -> movimiento del detalle. */
export function movDeOperacion(r: OperacionRow): Mov {
  return mapMov({
    id_txn: r.id_txn,
    tipo: r.tipo,
    cvu: r.cvu,
    monto_operacion: r.monto_operacion,
    comision: r.comision,
    impuesto: r.impuesto,
    fecha: r.fecha,
    legajo: r.legajo,
    estado_codigo: r.estados_movimiento?.codigo,
    estado_nombre: r.estados_movimiento?.nombre,
    destinatario_nombre: r.destinatario_nombre,
    destinatario_cuit: r.destinatario_cuit,
    destinatario_banco: r.destinatario_banco,
    subcuenta_id: r.subcuenta_id,
    subcuentas: r.subcuentas,
  });
}

export type ClienteComprobante = { nombre: string; cuit: string; cbu: string };

/**
 * Datos del comprobante de un movimiento del historial.
 *
 * Solo se completan los datos que realmente tenemos: la contraparte de una
 * transferencia (nombre y CUIT del destinatario) no se guarda en `movimientos`,
 * así que va vacía — nunca se inventa.
 */
export function comprobanteDeMov(m: Mov, cliente: ClienteComprobante): DatosComprobante {
  const esEgreso = m.tipo === "egreso";
  // La cuenta propia sale del movimiento (migracion 1020); si es viejo y no la
  // tiene, se usa el CBU del cliente que se pudo resolver.
  const yo = { nombre: cliente.nombre, cuit: cliente.cuit, cbu: m.subcuentaCbu || cliente.cbu };
  const otro = {
    nombre: m.contraparteNombre,
    cuit: m.contraparteCuit,
    cbu: m.cbuCvu === "—" ? "" : m.cbuCvu,
    banco: m.contraparteBanco || undefined,
  };
  return {
    fecha: m.fechaISO,
    monto: m.monto,
    comision: m.comision,
    impuesto: m.impuesto,
    estado: m.estado,
    txid: m.txid,
    // "Yo" es el dueño de la cuenta: en un egreso soy el origen, en un ingreso el destino.
    desde: esEgreso ? yo : otro,
    hacia: esEgreso ? otro : yo,
  };
}

/** Transferencias y retiros muestran comision e IVA y debitan monto + cargos. */
export function debitaCargos(m: Pick<Mov, "categoria">): boolean {
  return m.categoria === "Transferencias" || m.categoria === "Egresos";
}

export function montoDebitado(m: Pick<Mov, "monto" | "comision" | "impuesto">): number {
  return m.monto + (m.comision || 0) + (m.impuesto || 0);
}

/** Monto con signo que encabeza el detalle de un movimiento. */
export function montoDetalleTexto(m: Mov): string {
  if (m.tipo === "ingreso") return "+ " + formatMoney(m.monto);
  if (debitaCargos(m)) return "- " + formatMoney(montoDebitado(m));
  return "- " + formatMoney(m.monto);
}

/**
 * CBU para el comprobante: si el cliente tiene una sola cuenta (o todas con
 * el mismo CVU, como en el sandbox) se usa esa; si tiene varias distintas no
 * se puede saber cual se uso, asi que queda vacio (el movimiento no la guarda).
 */
export function cbuUnico(subcuentas: Array<{ cbu: string | null }>): string {
  const cbues = [...new Set(subcuentas.map((s) => s.cbu).filter(Boolean))];
  return cbues.length === 1 ? String(cbues[0]) : "";
}

// ---------------------------------------------------------------------------
// Movimientos por linea (vista v_transaction_lines): cada operacion trae una
// fila por concepto (ingreso/egreso, comision, impuesto, interes) con el mismo
// TXID. Sale del ledger, asi que filtros y paginacion corren en la base.
// ---------------------------------------------------------------------------
export type TipoLinea = "ingreso" | "egreso" | "comision" | "impuesto" | "interes" | "reverso";

export type Linea = {
  lineId: string;
  transactionId: string;
  idTxn: string;
  legajo: string;
  tipoOperacion: string;
  tipoLinea: TipoLinea;
  monto: number;
  fecha: string;
  lineNo: number;
  cvu: string | null;
  email: string | null;
  nombre: string | null;
  nombreDestino: string | null;
  cuit: string | null;
  estado: EstadoMov;
};

export type FilaLinea = Linea & { esCabeza: boolean; hijas: number };

export const TIPOS_LINEA: Array<{ k: TipoLinea | "Todos"; l: string }> = [
  { k: "Todos", l: "Todos" },
  { k: "ingreso", l: "Ingreso" },
  { k: "egreso", l: "Egreso" },
  { k: "comision", l: "Comisión" },
  { k: "impuesto", l: "Impuesto" },
  { k: "interes", l: "Interés" },
  { k: "reverso", l: "Reverso" },
];
const TIPO_LINEA_LABEL = new Map(TIPOS_LINEA.map((t) => [t.k, t.l]));

export function labelTipoLinea(t: TipoLinea): string {
  return TIPO_LINEA_LABEL.get(t) ?? t;
}

/** Operacion de negocio (transactions.tipo) que origino las lineas. */
export const OPERACIONES: Array<{ k: string; l: string; tipos: string[] | null }> = [
  { k: "Todas", l: "Todas", tipos: null },
  { k: "Transferencias", l: "Transferencias", tipos: ["transferencia"] },
  { k: "Depositos", l: "Depósitos", tipos: ["deposito"] },
  { k: "Retiros", l: "Retiros", tipos: ["retiro"] },
  { k: "Cobros con Tarjeta", l: "Cobros con Tarjeta", tipos: ["cobro_link", "tarjeta"] },
  { k: "Cobros con QR", l: "Cobros con QR", tipos: ["cobro_pct"] },
  { k: "Pagos con QR", l: "Pagos con QR", tipos: ["pago_pct"] },
  { k: "Liquidaciones", l: "Liquidación de lote", tipos: ["liquidacion_lote"] },
  { k: "Acreditaciones", l: "Acreditación de lote", tipos: ["acreditacion_lote"] },
  { k: "Adelantos", l: "Adelantos", tipos: ["adelanto"] },
  { k: "Ajustes", l: "Ajustes de saldo", tipos: ["ajuste_manual"] },
];

/** Tipos de `transactions` de la operacion elegida (null = todas). */
export function tiposDeOperacion(categoria: string): string[] | null {
  return OPERACIONES.find((o) => o.k === categoria)?.tipos ?? null;
}

export const formatFechaLinea = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const aLinea = (r: LineaMovimientoRow): Linea => ({
  lineId: r.line_id as string,
  transactionId: r.transaction_id as string,
  idTxn: r.id_txn as string,
  legajo: r.legajo as string,
  tipoOperacion: r.tipo_operacion as string,
  tipoLinea: r.tipo_linea as TipoLinea,
  monto: Number(r.monto) || 0,
  fecha: r.fecha as string,
  lineNo: r.line_no as number,
  cvu: r.cvu,
  email: r.email,
  nombre: r.nombre,
  nombreDestino: r.nombre_destino,
  cuit: r.cuit,
  estado: estadoVisible(r.estado_nombre ?? r.estado_codigo),
});

/**
 * Agrupacion por TXID dentro de la pagina: la primera linea de cada operacion
 * encabeza el grupo y el resto (comision, impuesto, ...) se despliega.
 */
export function agruparPorTxid(
  lineas: Linea[],
  agrupar: boolean,
  abiertos: ReadonlySet<string>,
): FilaLinea[] {
  const cantidad = new Map<string, number>();
  for (const l of lineas) cantidad.set(l.idTxn, (cantidad.get(l.idTxn) ?? 0) + 1);
  const vistos = new Set<string>();
  const out: FilaLinea[] = [];
  for (const l of lineas) {
    const esCabeza = !vistos.has(l.idTxn);
    vistos.add(l.idTxn);
    if (!agrupar) out.push({ ...l, esCabeza: false, hijas: 0 });
    else if (esCabeza) out.push({ ...l, esCabeza: true, hijas: (cantidad.get(l.idTxn) ?? 1) - 1 });
    else if (abiertos.has(l.idTxn)) out.push({ ...l, esCabeza: false, hijas: 0 });
  }
  return out;
}

export type TotalesHistorial = {
  totalIngresos: number;
  totalEgresos: number;
  lineasIngreso: number;
  lineasEgreso: number;
  txPendientes: number;
  txRechazadas: number;
  totalPendientes: number;
};

/** Totales de la pagina: el signo ya viene de la base. */
export function totalesPagina(lineas: Linea[]): TotalesHistorial {
  const ingresos = lineas.filter((l) => l.monto > 0);
  const egresos = lineas.filter((l) => l.monto < 0);
  const txPendientes = new Set(lineas.filter((l) => l.estado === "Pendiente").map((l) => l.idTxn));
  const txRechazadas = new Set(lineas.filter((l) => l.estado === "Rechazado").map((l) => l.idTxn));
  return {
    totalIngresos: ingresos.reduce((s, l) => s + l.monto, 0),
    totalEgresos: egresos.reduce((s, l) => s - l.monto, 0),
    lineasIngreso: ingresos.length,
    lineasEgreso: egresos.length,
    txPendientes: txPendientes.size,
    txRechazadas: txRechazadas.size,
    totalPendientes: txPendientes.size + txRechazadas.size,
  };
}

/** Texto "desde–hasta de total" del pie de la tabla. */
export function rangoPagina(page: number, pageSize: number, total: number): string {
  if (total === 0) return "0 registros";
  return `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`;
}
