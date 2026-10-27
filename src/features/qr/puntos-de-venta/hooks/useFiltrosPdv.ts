import { useMemo, useState } from "react";
import type { PuntoVenta } from "@/lib/api/qr";
import { FILTROS_VACIOS, filtrarPdvs, type FiltrosPdv } from "../utils";

/** Filtros + paginación de la tabla de puntos de venta. Cambiar un filtro vuelve a la página 1. */
export function useFiltrosPdv(pdvs: PuntoVenta[]) {
  const [filtros, setFiltros] = useState<FiltrosPdv>(FILTROS_VACIOS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(10);

  const filtered = useMemo(() => filtrarPdvs(pdvs, filtros), [pdvs, filtros]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const setFiltro = <K extends keyof FiltrosPdv>(k: K, v: FiltrosPdv[K]) => {
    setFiltros((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  const resetFilters = () => {
    setFiltros(FILTROS_VACIOS);
    setPage(1);
  };

  const setPageSize = (n: number) => {
    setPageSizeState(n);
    setPage(1);
  };

  return {
    filtros,
    setFiltro,
    resetFilters,
    filtered,
    paginated,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
  };
}

export type FiltrosPdvState = ReturnType<typeof useFiltrosPdv>;
