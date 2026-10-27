import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClienteSesion,
  getPerfilSesion,
  getResumenCuenta,
  type Cliente,
} from "@/lib/api/cuenta";

/** Nombre y email del usuario para el encabezado del portal. */
export function usePerfilSesion() {
  const query = useQuery({ queryKey: ["cuenta", "perfil"], queryFn: getPerfilSesion });
  return query.data ?? {};
}

const KEY_CLIENTE = ["cuenta", "cliente"] as const;

/**
 * Ficha del cliente de la sesión. No se refresca al volver a la pestaña para no
 * pisar el formulario mientras se edita; `setCliente` actualiza la caché.
 */
export function useClienteSesion() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY_CLIENTE,
    queryFn: getClienteSesion,
    refetchOnWindowFocus: false,
  });
  const setCliente = useCallback(
    (c: Cliente | null) => queryClient.setQueryData(KEY_CLIENTE, c),
    [queryClient],
  );
  return { cliente: query.data ?? null, isLoading: query.isLoading, setCliente };
}

/** Documentos KYC (con URL firmada) y movimientos del mes del cliente. */
export function useResumenCuenta(legajo: string | null | undefined) {
  const query = useQuery({
    queryKey: ["cuenta", "resumen", legajo],
    queryFn: () => getResumenCuenta(legajo as string),
    enabled: !!legajo,
    refetchOnWindowFocus: false,
  });
  return {
    documentos: query.data?.documentos ?? [],
    movimientosMes: query.data?.movimientosMes ?? 0,
    isLoading: query.isLoading,
  };
}
