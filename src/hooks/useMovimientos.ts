import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  getDashboard,
  getHistorial,
  getHistorialExportacion,
  type FiltrosHistorial,
  type MovimientoDashboard,
} from "@/lib/api/movimientos";

const SIN_MOVIMIENTOS: MovimientoDashboard[] = [];

/** Movimientos del período, saldo total y cantidad de cuentas del dashboard. */
export function useDashboard(start: Date, end: Date) {
  const desde = start.toISOString();
  const hasta = end.toISOString();
  const query = useQuery({
    queryKey: ["movimientos", "dashboard", desde, hasta],
    queryFn: () => getDashboard(desde, hasta),
    placeholderData: keepPreviousData,
  });
  const d = query.data;
  const cli = d?.cliente;
  return {
    movs: d?.movimientos ?? SIN_MOVIMIENTOS,
    saldoTotal: (d?.saldos ?? []).reduce(
      (a, x) => a + Number(x.saldo_disponible ?? 0) + Number(x.saldo_retenido ?? 0),
      0,
    ),
    cuentas: d ? d.saldos.length + 1 : 1,
    cbuLabel: cli ? (cli.alias ? `CVU ${cli.alias}` : cli.cbu ? `CBU ${cli.cbu}` : "") : "",
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
    errorUpdatedAt: query.errorUpdatedAt,
  };
}

/** Todas las líneas filtradas (sin paginar, con tope) para exportar a Excel/PDF. */
export function useExportacionHistorial() {
  return useMutation({
    mutationFn: (filtros: Omit<FiltrosHistorial, "page" | "pageSize">) =>
      getHistorialExportacion(filtros),
  });
}
