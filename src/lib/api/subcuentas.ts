import { requireSupabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";
import { emailSesion } from "./cuenta";
import { DataAccessError } from "./errors";

// Los saldos viven en `subaccount_balances` (1:1 con `subaccounts`). Se piden
// embebidos y se aplanan para que cada fila siga teniendo `saldo_disponible`,
// `saldo_retenido` y `saldo_conciliado` como antes.
//
// El cliente solo puede LEER sus saldos: los mueven las RPC del backend.

export const SALDOS_EMBED =
  "subaccount_balances(saldo_disponible, saldo_retenido, saldo_conciliado)";

export type Saldos = { saldo_disponible: number; saldo_retenido: number; saldo_conciliado: number };

export function conSaldos<T extends { subaccount_balances?: unknown }>(
  row: T,
): Omit<T, "subaccount_balances"> & Saldos {
  const { subaccount_balances: raw, ...rest } = row;
  const b = (Array.isArray(raw) ? raw[0] : raw) as Partial<Saldos> | null | undefined;
  return {
    ...rest,
    saldo_disponible: Number(b?.saldo_disponible ?? 0),
    saldo_retenido: Number(b?.saldo_retenido ?? 0),
    saldo_conciliado: Number(b?.saldo_conciliado ?? 0),
  };
}

export type SubcuentaConSaldos = Tables<"subaccounts"> & Saldos;
export type SubcuentaOrigen = Pick<Tables<"subaccounts">, "id" | "nombre" | "cbu"> & Saldos;
export type SubcuentaOrigenTipada = SubcuentaOrigen & Pick<Tables<"subaccounts">, "tipo">;

/** Legajo del cliente de la sesión (null si no hay sesión o cliente). */
export async function legajoSesion(): Promise<string | null> {
  const sb = requireSupabase();
  const mail = await emailSesion();
  if (!mail) return null;
  const { data, error } = await sb
    .from("clientes")
    .select("legajo")
    .eq("correo", mail)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  return data?.legajo ?? null;
}

/** Subcuentas del cliente (con saldos) para la pantalla Subcuentas. */
export async function listSubcuentasCliente(): Promise<{
  legajo: string | null;
  rows: SubcuentaConSaldos[];
} | null> {
  const sb = requireSupabase();
  const mail = await emailSesion();
  if (!mail) return null;
  const { data: cli, error: errCli } = await sb
    .from("clientes")
    .select("legajo")
    .eq("correo", mail)
    .maybeSingle();
  if (errCli) throw new DataAccessError(errCli);
  const { data, error } = await sb
    .from("subaccounts")
    .select(`*, subaccount_balances(saldo_disponible, saldo_retenido, saldo_conciliado)`)
    .eq("cliente_legajo", cli?.legajo ?? "");
  if (error) throw new DataAccessError(error);
  return { legajo: cli?.legajo ?? null, rows: (data ?? []).map(conSaldos) };
}

/** Subcuentas de origen (id, nombre, cbu + saldos) ordenadas por nombre. */
export async function listSubcuentasOrigen(legajo: string): Promise<SubcuentaOrigen[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("subaccounts")
    .select(
      "id, nombre, cbu, subaccount_balances(saldo_disponible, saldo_retenido, saldo_conciliado)",
    )
    .eq("cliente_legajo", legajo)
    .order("nombre", { ascending: true });
  if (error) throw new DataAccessError(error);
  return (data ?? []).map(conSaldos);
}

/** Igual que `listSubcuentasOrigen` pero incluye el tipo de subcuenta. */
export async function listSubcuentasOrigenConTipo(
  legajo: string,
): Promise<SubcuentaOrigenTipada[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("subaccounts")
    .select(
      "id, nombre, cbu, tipo, subaccount_balances(saldo_disponible, saldo_retenido, saldo_conciliado)",
    )
    .eq("cliente_legajo", legajo)
    .order("nombre", { ascending: true });
  if (error) throw new DataAccessError(error);
  return (data ?? []).map(conSaldos);
}

export async function createSubcuenta(input: TablesInsert<"subaccounts">): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("subaccounts").insert(input);
  if (error) throw new DataAccessError(error);
}

export async function updateSubcuenta(
  id: string,
  patch: TablesUpdate<"subaccounts">,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("subaccounts").update(patch).eq("id", id);
  if (error) throw new DataAccessError(error);
}

// Borrar y pausar/reactivar no propagan el error de PostgREST (comportamiento
// heredado de la pantalla: el toast de éxito sale aunque RLS lo rechace).
export async function deleteSubcuenta(id: string): Promise<void> {
  const sb = requireSupabase();
  await sb.from("subaccounts").delete().eq("id", id);
}

export async function setEstadoSubcuenta(id: string, estado: "Activa" | "Pausada"): Promise<void> {
  const sb = requireSupabase();
  await sb.from("subaccounts").update({ estado }).eq("id", id);
}

export async function transferirEntreSubcuentas(input: {
  origenId: string;
  destinoId: string;
  monto: number;
  concepto?: string;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("registrar_transferencia_subcuentas", {
    p_subcuenta_origen: input.origenId,
    p_subcuenta_destino: input.destinoId,
    p_monto: input.monto,
    p_concepto: input.concepto,
  });
  if (error) throw new DataAccessError(error);
}

export type MovimientoSubcuentaRow = Pick<
  Tables<"transactions">,
  "tipo" | "monto_operacion" | "comision" | "cvu" | "id_txn" | "fecha"
>;

/**
 * `subcuenta_id` identifica la subcuenta propia que intervino; `cvu` es la
 * contraparte. Se usan ambos para no perder movimientos viejos (anteriores a
 * subcuenta_id) ni las transferencias internas.
 */
export async function listMovimientosSubcuenta(
  id: string | undefined,
  cbu: string,
): Promise<MovimientoSubcuentaRow[]> {
  const sb = requireSupabase();
  const filtro = cbu ? `subcuenta_id.eq.${id},cvu.eq.${cbu}` : `subcuenta_id.eq.${id}`;
  const { data, error } = await sb
    .from("transactions")
    .select("tipo, monto_operacion, comision, cvu, id_txn, fecha")
    .or(filtro)
    .order("fecha", { ascending: false })
    .limit(200);
  if (error) throw new DataAccessError(error);
  return data ?? [];
}
