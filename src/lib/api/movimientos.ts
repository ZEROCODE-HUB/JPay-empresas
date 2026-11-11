import { requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { emailSesion } from "./cuenta";
import { DataAccessError } from "./errors";

// ============================================================================
// Dashboard (app.index)
// ============================================================================

export type Moneda = "MXN" | "USD";

/** Totales de una moneda del período (función `portal_resumen_periodo`). */
export type ResumenMoneda = {
  saldo: number;
  disponible: number;
  retenido: number;
  cuentas: number;
  entradas: number;
  ops_entradas: number;
  salidas: number;
  ops_salidas: number;
  comisiones: number;
  iva: number;
  /** Por categoría (deposito, envio_spei, conversion…): monto con signo y operaciones. */
  por_categoria: Record<string, { monto: number; ops: number }>;
  /** Apartado ahora por operaciones en curso (no depende del período). */
  pendiente: number;
  ops_pendientes: number;
  rechazado: number;
  ops_rechazadas: number;
};

export type ResumenPeriodo = {
  zona_horaria: string;
  cuentas: number;
  monedas: Partial<Record<Moneda, ResumenMoneda>>;
  /** Cobros con tarjeta (links y POS), por entorno: los de prueba no se suman con los reales. */
  cobros_tarjeta: { entorno: string; moneda: string; monto: number; ops: number }[];
  serie: { dia: string; moneda: string; depositos: number; entradas: number; salidas: number }[];
  serie_tarjeta: { dia: string; entorno: string; moneda: string; monto: number }[];
};

export type Dashboard = {
  /** CLABE del cliente (columna `cbu`). */
  clabe: string | null;
  resumen: ResumenPeriodo;
};

/**
 * Totales del período del cliente de la sesión, calculados por la base: por moneda, solo lo
 * contabilizado y sin tope de filas.
 */
export async function getDashboard(desde: string, hasta: string): Promise<Dashboard | null> {
  const s = requireSupabase();
  const mail = await emailSesion();
  if (!mail) return null;
  const [cli, resumen] = await Promise.all([
    s.from("clientes").select("cbu").eq("correo", mail).maybeSingle(),
    s.rpc("portal_resumen_periodo", { p_desde: desde, p_hasta: hasta }),
  ]);
  if (cli.error) throw new DataAccessError(cli.error);
  if (resumen.error) throw new DataAccessError(resumen.error);
  return { clabe: cli.data?.cbu ?? null, resumen: resumen.data as unknown as ResumenPeriodo };
}

// ============================================================================
// Historial (app.historial)
// ============================================================================

export type ClienteHistorial = Pick<
  Tables<"clientes">,
  "legajo" | "tipo_persona" | "nombre" | "tax_id" | "correo"
>;
export type SubcuentaHistorial = {
  id: string;
  nombre: string;
  cbu: string | null;
  moneda: "MXN" | "USD";
};

export type LineaMovimientoRow = Pick<
  Tables<"v_transaction_lines">,
  | "line_id"
  | "transaction_id"
  | "id_txn"
  | "legajo"
  | "tipo_operacion"
  | "tipo_linea"
  | "monto"
  | "fecha"
  | "line_no"
  | "cvu"
  | "email"
  | "nombre"
  | "nombre_destino"
  | "cuit"
  | "estado_codigo"
  | "estado_nombre"
  | "subaccount_id"
> & {
  /** Moneda de la subcuenta de la línea (la subcuenta en dólares mueve USD). */
  moneda: "MXN" | "USD";
};

export type FiltrosHistorial = {
  page: number;
  pageSize: number;
  /** `YYYY-MM-DD` (inclusive). */
  desde: string;
  hasta: string;
  /** Tipos de operación (`transactions.tipo`); null = todas. */
  tipos: string[] | null;
  /** null = todos. */
  tipoLinea: string | null;
  /** Nombre de la subcuenta elegida ("Todas" = sin filtro). */
  subcuenta: string;
  /** CLABE (propia o de la contraparte). */
  clabe: string;
  rfc: string;
  txid: string;
  titular: string;
};

export type Historial = {
  cliente: ClienteHistorial | null;
  subcuentas: SubcuentaHistorial[];
  lineas: LineaMovimientoRow[];
  total: number;
  /** Totales de todo lo filtrado (no solo la página). */
  totales: TotalesBaseHistorial | null;
};

const like = (v: string) => `%${v.trim().replace(/[%_,()]/g, "\\$&")}%`;

type Supabase = ReturnType<typeof requireSupabase>;

const COLUMNAS_LINEA =
  "line_id, transaction_id, id_txn, legajo, tipo_operacion, tipo_linea, monto, fecha, line_no, cvu, email, nombre, nombre_destino, cuit, estado_codigo, estado_nombre, subaccount_id, moneda";

/** Cliente de la sesión y sus subcuentas (ordenadas por nombre). */
async function clienteYSubcuentas(
  sb: Supabase,
): Promise<{ cliente: ClienteHistorial | null; subcuentas: SubcuentaHistorial[] }> {
  const mail = await emailSesion();
  const { data: cli, error: errCli } = await sb
    .from("clientes")
    .select("legajo, tipo_persona, nombre, tax_id, correo")
    .eq("correo", mail ?? "")
    .maybeSingle();
  if (errCli) throw new DataAccessError(errCli);
  if (!cli?.legajo) return { cliente: cli, subcuentas: [] };

  const { data: subs, error: errSubs } = await sb
    .from("subaccounts")
    .select("id, nombre, cbu, moneda")
    .eq("cliente_legajo", cli.legajo)
    .order("nombre", { ascending: true });
  if (errSubs) throw new DataAccessError(errSubs);
  const subcuentas = (subs ?? []).map((s) => ({
    id: s.id,
    nombre: s.nombre || "Sin nombre",
    cbu: s.cbu ?? null,
    moneda: (s.moneda === "USD" ? "USD" : "MXN") as "MXN" | "USD",
  }));
  return { cliente: cli, subcuentas };
}

/** Agrega a cada línea la moneda de su subcuenta. */
function conMoneda(
  filas: (Omit<LineaMovimientoRow, "moneda"> & { moneda: string | null })[],
  subcuentas: SubcuentaHistorial[],
): LineaMovimientoRow[] {
  // La moneda viene del asiento (vista); la de la subcuenta queda de respaldo.
  const usd = new Set(subcuentas.filter((s) => s.moneda === "USD").map((s) => s.id));
  return filas.map((f) => ({
    ...f,
    moneda:
      f.moneda === "USD" || f.moneda === "MXN"
        ? f.moneda
        : f.subaccount_id && usd.has(f.subaccount_id)
          ? "USD"
          : "MXN",
  }));
}

/** Totales del historial (función `portal_totales_historial`) sobre TODO lo filtrado. */
export type TotalesBaseHistorial = {
  lineas: number;
  monedas: Partial<
    Record<
      Moneda,
      {
        ingresos: number;
        egresos: number;
        neto: number;
        lineas_ingreso: number;
        lineas_egreso: number;
      }
    >
  >;
  tx_pendientes: number;
  tx_rechazadas: number;
};

async function totalesLineas(
  sb: Supabase,
  subcuentas: SubcuentaHistorial[],
  f: Omit<FiltrosHistorial, "page" | "pageSize">,
): Promise<TotalesBaseHistorial> {
  const sub =
    f.subcuenta !== "Todas" ? subcuentas.find((s) => s.nombre === f.subcuenta) : undefined;
  const { data, error } = await sb.rpc("portal_totales_historial", {
    p_desde: f.desde ? new Date(f.desde + "T00:00:00").toISOString() : undefined,
    p_hasta: f.hasta ? new Date(f.hasta + "T23:59:59").toISOString() : undefined,
    p_tipos: f.tipos ?? undefined,
    p_tipo_linea: f.tipoLinea ?? undefined,
    p_subaccount_id: sub?.id,
    p_clabe: f.clabe.trim() || undefined,
    p_rfc: f.rfc.trim() || undefined,
    p_txid: f.txid.trim() || undefined,
    p_titular: f.titular.trim() || undefined,
  });
  if (error) throw new DataAccessError(error);
  return data as unknown as TotalesBaseHistorial;
}

/** Consulta de líneas con todos los filtros aplicados, ordenada, sin rango. */
function consultaLineas(
  sb: Supabase,
  legajo: string,
  subcuentas: SubcuentaHistorial[],
  f: Omit<FiltrosHistorial, "page" | "pageSize">,
  conTotal: boolean,
) {
  let q = sb
    .from("v_transaction_lines")
    .select(COLUMNAS_LINEA, conTotal ? { count: "exact" } : undefined)
    .eq("legajo", legajo);

  if (f.desde) q = q.gte("fecha", new Date(f.desde + "T00:00:00").toISOString());
  if (f.hasta) q = q.lte("fecha", new Date(f.hasta + "T23:59:59").toISOString());

  if (f.tipos)
    q = f.tipos.length === 1 ? q.eq("tipo_operacion", f.tipos[0]) : q.in("tipo_operacion", f.tipos);
  if (f.tipoLinea) q = q.eq("tipo_linea", f.tipoLinea);

  // La línea se vincula a la subcuenta por `subaccount_id`.
  if (f.subcuenta !== "Todas") {
    const match = subcuentas.find((s) => s.nombre === f.subcuenta);
    if (match) q = q.eq("subaccount_id", match.id);
  }

  // La cuenta y el identificador fiscal viven en las columnas `cvu`, `cvu_propio` y `cuit`.
  if (f.clabe.trim()) q = q.or(`cvu.ilike.${like(f.clabe)},cvu_propio.ilike.${like(f.clabe)}`);
  if (f.txid.trim()) q = q.ilike("id_txn", like(f.txid));
  if (f.titular.trim()) q = q.ilike("nombre_destino", like(f.titular));
  const rfc = f.rfc.replace(/[\s-]/g, "");
  if (rfc) q = q.ilike("cuit", like(rfc));

  // Más reciente primero; dentro de una operación, en el orden de sus líneas.
  return q
    .order("fecha", { ascending: false })
    .order("id_txn", { ascending: true })
    .order("line_no", { ascending: true });
}

/** Cliente, subcuentas y una página de líneas contables (`v_transaction_lines`). */
export async function getHistorial(f: FiltrosHistorial): Promise<Historial> {
  const sb = requireSupabase();
  const { cliente: cli, subcuentas } = await clienteYSubcuentas(sb);
  const legajo = cli?.legajo;
  if (!legajo) return { cliente: cli, subcuentas: [], lineas: [], total: 0, totales: null };

  const from = (f.page - 1) * f.pageSize;
  const to = from + f.pageSize - 1;
  const [{ data, count, error }, totales] = await Promise.all([
    consultaLineas(sb, legajo, subcuentas, f, true).range(from, to),
    totalesLineas(sb, subcuentas, f),
  ]);
  if (error) throw new DataAccessError(error);

  return {
    cliente: cli,
    subcuentas,
    lineas: conMoneda(data ?? [], subcuentas),
    total: count ?? 0,
    totales,
  };
}

/** Tope de filas de una exportación. */
export const MAX_FILAS_EXPORTACION = 10_000;
/** Filas por pedido: PostgREST corta cada respuesta en 1000 por defecto. */
const LOTE_EXPORTACION = 1000;

export type HistorialExportacion = {
  lineas: LineaMovimientoRow[];
  /** true si había más filas que `MAX_FILAS_EXPORTACION` y se cortó. */
  truncado: boolean;
};

/**
 * Todas las líneas que cumplen los filtros (sin paginar), para exportar.
 * Se traen en lotes hasta `limite` filas.
 */
export async function getHistorialExportacion(
  f: Omit<FiltrosHistorial, "page" | "pageSize">,
  limite: number = MAX_FILAS_EXPORTACION,
): Promise<HistorialExportacion> {
  const sb = requireSupabase();
  const { cliente, subcuentas } = await clienteYSubcuentas(sb);
  const legajo = cliente?.legajo;
  if (!legajo) return { lineas: [], truncado: false };

  const lineas: LineaMovimientoRow[] = [];
  // Se pide una fila de más para saber si el resultado quedó cortado.
  while (lineas.length <= limite) {
    const from = lineas.length;
    const to = Math.min(from + LOTE_EXPORTACION, limite + 1) - 1;
    const { data, error } = await consultaLineas(sb, legajo, subcuentas, f, false).range(from, to);
    if (error) throw new DataAccessError(error);
    const lote = data ?? [];
    // Se corta solo con un lote vacío: si el servidor tiene un `max-rows`
    // menor que el lote, un lote corto no significa que no haya más filas.
    if (lote.length === 0) break;
    lineas.push(...conMoneda(lote, subcuentas));
  }
  return { lineas: lineas.slice(0, limite), truncado: lineas.length > limite };
}

export type OperacionRow = Pick<
  Tables<"transactions">,
  | "id_txn"
  | "tipo"
  | "cvu"
  | "monto_operacion"
  | "comision"
  | "impuesto"
  | "fecha"
  | "legajo"
  | "destinatario_nombre"
  | "destinatario_cuit"
  | "destinatario_banco"
  | "subcuenta_id"
> & {
  subcuentas: Pick<Tables<"subaccounts">, "cbu"> | null;
  estados_movimiento: Pick<Tables<"estados_movimiento">, "codigo" | "nombre"> | null;
};

/** Operación completa de una línea (detalle y comprobante). */
export async function getOperacion(transactionId: string): Promise<OperacionRow> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("transactions")
    .select(
      "id_txn, tipo, cvu, monto_operacion, comision, impuesto, fecha, legajo, destinatario_nombre, destinatario_cuit, destinatario_banco, subcuenta_id, subcuentas:subaccounts(cbu), estados_movimiento(codigo, nombre)",
    )
    .eq("id", transactionId)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  if (!data) throw new Error("no encontrada");
  return data;
}
