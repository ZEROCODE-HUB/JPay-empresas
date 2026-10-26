// Los saldos viven en `subaccount_balances` (1:1 con `subaccounts`). Se piden
// embebidos y se aplanan para que cada fila siga teniendo `saldo_disponible`,
// `saldo_retenido` y `saldo_conciliado` como antes.
//
// El cliente solo puede LEER sus saldos: los mueven las RPC del backend.

export const SALDOS_EMBED = "subaccount_balances(saldo_disponible, saldo_retenido, saldo_conciliado)";

type Saldos = { saldo_disponible: number; saldo_retenido: number; saldo_conciliado: number };

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
