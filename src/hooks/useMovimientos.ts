import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  getDashboard,
  getHistorial,
  getHistorialExportacion,
  type FiltrosHistorial,
} from "@/lib/api/movimientos";

/** Resumen del período del Inicio (totales de la base) y CLABE del cliente. */
export function useDashboard(start: Date, end: Date) {
  const desde = start.toISOString();
  const hasta = end.toISOString();
  const query = useQuery({
    queryKey: ["movimientos", "dashboard", desde, hasta],
    queryFn: () => getDashboard(desde, hasta),
    placeholderData: keepPreviousData,
  });
  const d = query.data;
  return {
    resumen: d?.resumen,
    cuentaLabel: d?.clabe ? `CLABE ${d.clabe}` : "",
    isLoading: query.isPending,
    error: query.isError && !d ? query.error : null,
    refetch: () => void query.refetch(),
  };
}

/** Página de líneas contables del historial (con cliente y subcuentas). */
export function useHistorial(filtros: FiltrosHistorial) {
  const query = useQuery({
    queryKey: ["movimientos", "historial", filtros],
    queryFn: () => getHistorial(filtros),
    placeholderData: keepPreviousData,
    retry: false,
  });
  return {
    data: query.data,
    loading: query.isFetching,
    isError: query.isError,
    /** Primera carga (todavía no hay datos que mostrar). */
    cargando: query.isPending,
    error: query.error,
    errorUpdatedAt: query.errorUpdatedAt,
    refetch: () => void query.refetch(),
  };
}

/** Todas las líneas filtradas (sin paginar, con tope) para exportar a Excel/PDF. */
export function useExportacionHistorial() {
  return useMutation({
    mutationFn: (filtros: Omit<FiltrosHistorial, "page" | "pageSize">) =>
      getHistorialExportacion(filtros),
  });
}
