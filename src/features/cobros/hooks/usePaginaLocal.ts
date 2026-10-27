import { useEffect, useState } from "react";
import { paginar, totalPaginas } from "../utils";

/**
 * Paginación en memoria con tamaño fijo. Vuelve a la página 1 cuando cambia `reset`
 * (por ejemplo la cantidad de filas o el array cargado).
 */
export function usePaginaLocal<T>(rows: T[], pageSize: number, reset: unknown) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [reset]);

  const total = totalPaginas(rows.length, pageSize);
  return {
    page,
    pageSize,
    totalPages: total,
    visibles: paginar(rows, page, pageSize),
    anterior: () => setPage((p) => Math.max(1, p - 1)),
    siguiente: () => setPage((p) => Math.min(total, p + 1)),
  };
}
