import { useEffect, useMemo, useState } from "react";
import type { Sub } from "../types";
import { filtrarSubs } from "../utils";

const PAGE_SIZE = 10;

/** Búsqueda, filtros de tipo/estado y paginación de la tabla de subcuentas. */
export function useListadoSubcuentas(subs: Sub[]) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [estado, setEstado] = useState("Todos");
  const [page, setPage] = useState(1);

  const filtradas = useMemo(() => filtrarSubs(subs, q, tipo, estado), [subs, q, tipo, estado]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginated = filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, tipo, estado]);

  return {
    q,
    setQ,
    tipo,
    setTipo,
    estado,
    setEstado,
    page,
    setPage,
    pageSize: PAGE_SIZE,
    totalPages,
    filtradas,
    paginated,
  };
}
