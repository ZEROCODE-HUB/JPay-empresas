import { requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { emailSesion } from "./cuenta";
import { DataAccessError } from "./errors";
import { conSaldos, type Saldos } from "./subcuentas";

// ============================================================================
// Dashboard (app.index)
// ============================================================================

export type MovimientoDashboard = Pick<
  Tables<"transactions">,
  "tipo" | "monto_operacion" | "fecha"
>;

export type Dashboard = {
  cliente: Pick<Tables<"clientes">, "legajo" | "cbu" | "alias">;
  movimientos: MovimientoDashboard[];
  saldos: Saldos[];
};

/** Movimientos del período y saldos de las subcuentas del cliente de la sesión. */
export async function getDashboard(desde: string, hasta: string): Promise<Dashboard | null> {
  const s = requireSupabase();
  const mail = await emailSesion();
  if (!mail) return null;
  const { data: cli, error: errCli } = await s
    .from("clientes")
    .select("legajo, cbu, alias")
    .eq("correo", mail)
    .maybeSingle();
  if (errCli) throw new DataAccessError(errCli);
  if (!cli) return null;
  const { data: m, error: errMov } = await s
    .from("transactions")
    .select("tipo, monto_operacion, fecha")
    .eq("legajo", cli.legajo)
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (errMov) throw new DataAccessError(errMov);
  const { data: subs, error: errSubs } = await s
    .from("subaccounts")
    .select("subaccount_balances(saldo_disponible, saldo_retenido, saldo_conciliado)")
    .eq("cliente_legajo", cli.legajo);
  if (errSubs) throw new DataAccessError(errSubs);
  return { cliente: cli, movimientos: m ?? [], saldos: (subs ?? []).map(conSaldos) };
}

// ============================================================================
// Historial (app.historial)
// ============================================================================

export type ClienteHistorial = Pick<
  Tables<"clientes">,
  "legajo" | "tipo_persona" | "nombre" | "cuit" | "cuit_cuil" | "correo"
>;
export type SubcuentaHistorial = { id: string; nombre: string; cbu: string | null };

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
>;

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
  cbu: string;
  cuit: string;
  txid: string;
  titular: string;
};

export type Historial = {
  cliente: ClienteHistorial | null;
  subcuentas: SubcuentaHistorial[];
  lineas: LineaMovimientoRow[];
  total: number;
};

const like = (v: string) => `%${v.trim().replace(/[%_,()]/g, "\\$&")}%`;

type Supabase = ReturnType<typeof requireSupabase>;

const COLUMNAS_LINEA =
  "line_id, transaction_id, id_txn, legajo, tipo_operacion, tipo_linea, monto, fecha, line_no, cvu, email, nombre, nombre_destino, cuit, estado_codigo, estado_nombre";

/** Cliente de la sesión y sus subcuentas (ordenadas por nombre). */
async function clienteYSubcuentas(
  sb: Supabase,
): Promise<{ cliente: ClienteHistorial | null; subcuentas: SubcuentaHistorial[] }> {
  const mail = await emailSesion();
  const { data: cli, error: errCli } = await sb
    .from("clientes")
    .select("legajo, tipo_persona, nombre, cuit, cuit_cuil, correo")
    .eq("correo", mail ?? "")
    .maybeSingle();
  if (errCli) throw new DataAccessError(errCli);
  if (!cli?.legajo) return { cliente: cli, subcuentas: [] };

  const { data: subs, error: errSubs } = await sb
    .from("subaccounts")
    .select("id, nombre, cbu")
    .eq("cliente_legajo", cli.legajo)
    .order("nombre", { ascending: true });
  if (errSubs) throw new DataAccessError(errSubs);
  const subcuentas = (subs ?? []).map((s) => ({
    id: s.id,
    nombre: s.nombre || "Sin nombre",
    cbu: s.cbu ?? null,
  }));
  return { cliente: cli, subcuentas };
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

  if (f.cbu.trim()) q = q.or(`cvu.ilike.${like(f.cbu)},cvu_propio.ilike.${like(f.cbu)}`);
  if (f.txid.trim()) q = q.ilike("id_txn", like(f.txid));
  if (f.titular.trim()) q = q.ilike("nombre_destino", like(f.titular));
  const cuitDigitos = f.cuit.replace(/\D/g, "");
  if (cuitDigitos) q = q.ilike("cuit", like(cuitDigitos));

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
  if (!legajo) return { cliente: cli, subcuentas: [], lineas: [], total: 0 };

  const from = (f.page - 1) * f.pageSize;
  const to = from + f.pageSize - 1;
  const { data, count, error } = await consultaLineas(sb, legajo, subcuentas, f, true).range(
    from,
    to,
  );
  if (error) throw new DataAccessError(error);

  return { cliente: cli, subcuentas, lineas: data ?? [], total: count ?? 0 };
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
    lineas.push(...lote);
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
