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

// RLS no devuelve error cuando bloquea un delete/update: solo afecta 0 filas. Por eso se
// pide la fila afectada y se trata "ninguna" como error.
export async function deleteSubcuenta(id: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("subaccounts").delete().eq("id", id).select("id");
  if (error) throw new DataAccessError(error);
  if (!data?.length) throw new Error("No se pudo eliminar la subcuenta");
}

export async function setEstadoSubcuenta(id: string, estado: "Activa" | "Pausada"): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("subaccounts").update({ estado }).eq("id", id).select("id");
  if (error) throw new DataAccessError(error);
  if (!data?.length) throw new Error("No se pudo actualizar el estado");
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

/** Una operación de la subcuenta, con el signo del asiento (+ entra, − sale). */
export type MovimientoSubcuentaRow = {
  id_txn: string;
  tipo: string;
  /** deposito, envio_spei, envio_usd, conversion, interna, ajuste, cobro_tarjeta, retiro… */
  categoria: string | null;
  cvu: string | null;
  contraparte: string | null;
  fecha: string;
  estado: string | null;
  monto: number;
  comision: number;
  iva: number;
};

export type DetalleSubcuenta = {
  moneda: "MXN" | "USD";
  totales: {
    entradas: number;
    ops_entradas: number;
    salidas: number;
    ops_salidas: number;
    comisiones: number;
    iva: number;
  };
  /** Apartado ahora por operaciones en curso. */
  pendiente: number;
  movimientos: MovimientoSubcuentaRow[];
};

/**
 * Movimientos (los últimos 200) y totales de TODA la historia de una subcuenta, calculados por la
 * base con el signo del asiento: una conversión sale, una transferencia interna recibida entra.
 */
export async function getDetalleSubcuenta(id: string): Promise<DetalleSubcuenta> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("portal_detalle_subcuenta", { p_subaccount_id: id });
  if (error) throw new DataAccessError(error);
  return data as unknown as DetalleSubcuenta;
}
