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
  rfc: string;
  clabe: string;
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
  senderRfc: string;
  senderClabe: string;
  receiverName: string;
  receiverRfc: string;
  receiverClabe: string;
  receiverBanco: string;
  /**
   * La contraparte del movimiento, sin importar el sentido: en un egreso es el
   * destinatario y en un ingreso es quien transfirio.
   */
  contraparteNombre: string;
  contraparteRfc: string;
  contraparteBanco: string;
  /** CLABE de la cuenta PROPIA que intervino (la de origen en un egreso). */
  subcuentaClabe: string;
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
    cobro_link: "Cobros con Tarjeta",
    deposito: "Ingresos",
    transferencia: "Egresos",
    retiro: "Egresos",
    comision: "Comisiones",
    // Operaciones internas registradas por el ledger.
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
    rfc: "—",
    clabe: r.cvu ?? "—",
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
    senderRfc: "—",
    senderClabe: r.cvu ?? "—",
    receiverName: tipo === "ingreso" ? brand.name : (r.destinatario_nombre ?? ""),
    receiverRfc: tipo === "ingreso" ? "—" : (r.destinatario_cuit ?? ""),
    receiverClabe: r.cvu ?? "—",
    receiverBanco: tipo === "ingreso" ? "" : (r.destinatario_banco ?? ""),
    // Mismo dato sin importar el sentido: el comprobante lo usa para la contraparte.
    contraparteNombre: r.destinatario_nombre ?? "",
    contraparteRfc: r.destinatario_cuit ?? "",
    contraparteBanco: r.destinatario_banco ?? "",
    subcuentaClabe: (Array.isArray(r.subcuentas) ? r.subcuentas[0]?.cbu : r.subcuentas?.cbu) ?? "",
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

export type ClienteComprobante = { nombre: string; rfc: string; clabe: string };

/**
 * Datos del comprobante de un movimiento del historial.
 *
 * Solo se completan los datos que realmente tenemos: la contraparte de una
 * transferencia (nombre y RFC del destinatario) no se guarda en `movimientos`,
 * así que va vacía — nunca se inventa.
 */
export function comprobanteDeMov(m: Mov, cliente: ClienteComprobante): DatosComprobante {
  const esEgreso = m.tipo === "egreso";
  // La cuenta propia sale del movimiento (migracion 1020); si es viejo y no la
  // tiene, se usa la CLABE del cliente que se pudo resolver.
  const yo = {
    nombre: cliente.nombre,
    rfc: cliente.rfc,
    clabe: m.subcuentaClabe || cliente.clabe,
  };
  const otro = {
    nombre: m.contraparteNombre,
    rfc: m.contraparteRfc,
    clabe: m.clabe === "—" ? "" : m.clabe,
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
 * CLABE para el comprobante: si el cliente tiene una sola cuenta (o todas con
 * la misma CLABE, como en el sandbox) se usa esa; si tiene varias distintas no
 * se puede saber cual se uso, asi que queda vacio (el movimiento no la guarda).
 */
export function clabeUnica(subcuentas: Array<{ cbu: string | null }>): string {
  const clabes = [...new Set(subcuentas.map((s) => s.cbu).filter(Boolean))];
  return clabes.length === 1 ? String(clabes[0]) : "";
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
  /** La subcuenta en dólares mueve USD; el resto, pesos. */
  moneda: "MXN" | "USD";
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
  moneda: r.moneda === "USD" ? "USD" : "MXN",
});

/**
 * Orden dentro de una operacion: primero el movimiento principal (el ingreso o
 * egreso de la plata) y despues lo que sale de el (comision, impuesto, ...).
 */
const ORDEN_LINEA: Record<TipoLinea, number> = {
  ingreso: 0,
  egreso: 0,
  reverso: 1,
  interes: 2,
  comision: 3,
  impuesto: 4,
};

/**
 * Agrupacion por TXID dentro de la pagina: encabeza el grupo la linea principal
 * de la operacion (ingreso o egreso; si no hay, la de menor numero de linea) y el
 * resto (comision, impuesto, ...) se despliega debajo de ella. El grupo queda en
 * el lugar donde aparece por primera vez en la pagina.
 */
export function agruparPorTxid(
  lineas: Linea[],
  agrupar: boolean,
  abiertos: ReadonlySet<string>,
): FilaLinea[] {
  if (!agrupar) return lineas.map((l) => ({ ...l, esCabeza: false, hijas: 0 }));
  const grupos = new Map<string, Linea[]>();
  for (const l of lineas) {
    const g = grupos.get(l.idTxn);
    if (g) g.push(l);
    else grupos.set(l.idTxn, [l]);
  }
  const out: FilaLinea[] = [];
  for (const [idTxn, grupo] of grupos) {
    const ordenado = grupo
      .map((l, i) => ({ l, i }))
      .sort(
        (a, b) =>
          (ORDEN_LINEA[a.l.tipoLinea] ?? 9) - (ORDEN_LINEA[b.l.tipoLinea] ?? 9) ||
          a.l.lineNo - b.l.lineNo ||
          a.i - b.i,
      )
      .map((x) => x.l);
    const [cabeza, ...resto] = ordenado;
    out.push({ ...cabeza, esCabeza: true, hijas: resto.length });
    if (abiertos.has(idTxn)) for (const l of resto) out.push({ ...l, esCabeza: false, hijas: 0 });
  }
  return out;
}

/**
 * Ingresos, egresos y neto en la moneda de la vista (pesos, o dólares si se filtra la subcuenta en
 * dólares). Lo de la otra moneda va aparte: no se suman pesos con dólares.
 */
export type TotalesHistorial = {
  moneda: "MXN" | "USD";
  totalIngresos: number;
  totalEgresos: number;
  /** Neto de las líneas en la otra moneda. */
  netoOtra: number;
  lineasOtra: number;
  lineasIngreso: number;
  lineasEgreso: number;
  txPendientes: number;
  txRechazadas: number;
  totalPendientes: number;
};

/** Totales de la pagina: el signo ya viene de la base. */
export function totalesPagina(lineas: Linea[], moneda: "MXN" | "USD" = "MXN"): TotalesHistorial {
  const propias = lineas.filter((l) => l.moneda === moneda);
  const otras = lineas.filter((l) => l.moneda !== moneda);
  const ingresos = propias.filter((l) => l.monto > 0);
  const egresos = propias.filter((l) => l.monto < 0);
  const txPendientes = new Set(lineas.filter((l) => l.estado === "Pendiente").map((l) => l.idTxn));
  const txRechazadas = new Set(lineas.filter((l) => l.estado === "Rechazado").map((l) => l.idTxn));
  return {
    moneda,
    totalIngresos: ingresos.reduce((s, l) => s + l.monto, 0),
    totalEgresos: egresos.reduce((s, l) => s - l.monto, 0),
    netoOtra: otras.reduce((s, l) => s + l.monto, 0),
    lineasOtra: otras.length,
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

export type ModoVista = "principal" | "sub";

/**
 * Estado del selector "Vista" derivado del filtro de subcuenta, que es el que
 * filtra de verdad: "Cuenta principal" = todas las subcuentas (consolidado) y
 * "Por subcuenta" = la subcuenta elegida. `modoSub` recuerda que se eligió
 * "Por subcuenta" aunque todavía no haya ninguna subcuenta para filtrar.
 */
export function estadoVista(
  subFiltro: string,
  modoSub: boolean,
  primeraSubcuenta: string | undefined,
): { vista: ModoVista; sub: string } {
  const filtrando = subFiltro !== "Todas";
  return {
    vista: filtrando || (modoSub && !primeraSubcuenta) ? "sub" : "principal",
    sub: filtrando ? subFiltro : (primeraSubcuenta ?? ""),
  };
}

/** Filtro de subcuenta que corresponde al elegir una vista. */
export function subFiltroDeVista(vista: ModoVista, primeraSubcuenta: string | undefined): string {
  return vista === "sub" && primeraSubcuenta ? primeraSubcuenta : "Todas";
}
