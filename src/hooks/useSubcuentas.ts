import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listMovimientosSubcuenta,
  listSubcuentasCliente,
  type SubcuentaConSaldos,
} from "@/lib/api/subcuentas";

/**
 * Subcuentas del cliente (pantalla Subcuentas). `mapear` convierte las filas al
 * modelo de la pantalla al cargarlas; `setSubs` edita la caché como estado local.
 */
export function useSubcuentasCliente<T>(mapear: (rows: SubcuentaConSaldos[]) => T[]) {
  const queryClient = useQueryClient();
  const queryKey = ["subcuentas", "cliente"];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const r = await listSubcuentasCliente();
      return r ? { legajo: r.legajo, subs: mapear(r.rows) } : null;
    },
  });

  const setSubs = useCallback(
    (fn: (prev: T[]) => T[]) =>
      queryClient.setQueryData<{ legajo: string | null; subs: T[] } | null>(
        ["subcuentas", "cliente"],
        (prev) => (prev ? { ...prev, subs: fn(prev.subs) } : prev),
      ),
    [queryClient],
  );

  return {
    subs: query.data?.subs ?? [],
    clienteLegajo: query.data?.legajo ?? null,
    loading: query.isLoading,
    setSubs,
    recargar: async () => {
      await query.refetch();
    },
  };
}

export function useMovimientosSubcuenta(id: string | undefined, cbu: string) {
  const query = useQuery({
    queryKey: ["subcuentas", "movimientos", id, cbu],
    queryFn: () => listMovimientosSubcuenta(id, cbu),
    retry: false,
  });
  return { movimientos: query.data ?? [], loading: query.isLoading };
}
