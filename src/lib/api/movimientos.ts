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

/** Cliente, subcuentas y una página de líneas contables (`v_transaction_lines`). */
export async function getHistorial(f: FiltrosHistorial): Promise<Historial> {
  const sb = requireSupabase();
  const mail = await emailSesion();
  const { data: cli, error: errCli } = await sb
    .from("clientes")
    .select("legajo, tipo_persona, nombre, cuit, cuit_cuil, correo")
    .eq("correo", mail ?? "")
    .maybeSingle();
  if (errCli) throw new DataAccessError(errCli);
  const legajo = cli?.legajo;
  if (!legajo) return { cliente: cli, subcuentas: [], lineas: [], total: 0 };

  const { data: subs, error: errSubs } = await sb
    .from("subaccounts")
    .select("id, nombre, cbu")
    .eq("cliente_legajo", legajo)
    .order("nombre", { ascending: true });
  if (errSubs) throw new DataAccessError(errSubs);
  const subcuentas = (subs ?? []).map((s) => ({
    id: s.id,
    nombre: s.nombre || "Sin nombre",
    cbu: s.cbu ?? null,
  }));

  const from = (f.page - 1) * f.pageSize;
  const to = from + f.pageSize - 1;

  let q = sb
    .from("v_transaction_lines")
    .select(
      "line_id, transaction_id, id_txn, legajo, tipo_operacion, tipo_linea, monto, fecha, line_no, cvu, email, nombre, nombre_destino, cuit, estado_codigo, estado_nombre",
      { count: "exact" },
    )
    .eq("legajo", legajo);

  if (f.desde) q = q.gte("fecha", new Date(f.desde + "T00:00:00").toISOString());
  if (f.hasta) q = q.lte("fecha", new Date(f.hasta + "T23:59:59").toISOString());

  if (f.tipos)
    q = f.tipos.length === 1 ? q.eq("tipo_operacion", f.tipos[0]) : q.in("tipo_operacion", f.tipos);
  if (f.tipoLinea) q = q.eq("tipo_linea", f.tipoLinea);

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
  const { data, count, error } = await q
    .order("fecha", { ascending: false })
    .order("id_txn", { ascending: true })
    .order("line_no", { ascending: true })
    .range(from, to);
  if (error) throw new DataAccessError(error);

  return { cliente: cli, subcuentas, lineas: data ?? [], total: count ?? 0 };
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
