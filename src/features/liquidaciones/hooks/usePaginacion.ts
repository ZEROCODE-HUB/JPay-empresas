import { useState } from "react";
import { paginar } from "../utils";

export const FILAS_POR_PAGINA = [10, 20, 50];

/** Paginación client-side de una lista (página 1-based, 10 filas por defecto). */
export function usePaginacion<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(10);
  const setPageSize = (n: number) => {
    setPageSizeState(n);
    setPage(1);
  };
  return {
    ...paginar(items, page, pageSize),
    page,
    pageSize,
    total: items.length,
    setPage,
    setPageSize,
  };
}

export type Paginacion<T> = ReturnType<typeof usePaginacion<T>>;
