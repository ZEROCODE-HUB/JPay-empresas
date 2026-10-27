import { useEffect, useState } from "react";
import type { FiltrosHistorial } from "@/lib/api/movimientos";
import { tiposDeOperacion, type TipoLinea } from "../utils";

export const PAGE_SIZE = 25;

/** Filtros, búsquedas y página del historial. Cambiar un filtro vuelve a la página 1. */
export function useFiltrosHistorial(subcuentaInicial: string | undefined) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [tipoLinea, setTipoLinea] = useState<TipoLinea | "Todos">("Todos");
  const [subFiltro, setSubFiltro] = useState(subcuentaInicial ?? "Todas");
  const [buscarCbu, setBuscarCbu] = useState("");
  const [buscarCuit, setBuscarCuit] = useState("");
  const [buscarTxid, setBuscarTxid] = useState("");
  const [buscarTitular, setBuscarTitular] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [
    desde,
    hasta,
    categoria,
    tipoLinea,
    subFiltro,
    buscarCbu,
    buscarCuit,
    buscarTxid,
    buscarTitular,
  ]);

  function limpiar() {
    setDesde("");
    setHasta("");
    setCategoria("Todas");
    setTipoLinea("Todos");
    setSubFiltro("Todas");
    setBuscarCbu("");
    setBuscarCuit("");
    setBuscarTxid("");
    setBuscarTitular("");
  }

  const query: FiltrosHistorial = {
    page,
    pageSize: PAGE_SIZE,
    desde,
    hasta,
    tipos: tiposDeOperacion(categoria),
    tipoLinea: tipoLinea !== "Todos" ? tipoLinea : null,
    subcuenta: subFiltro,
    cbu: buscarCbu,
    cuit: buscarCuit,
    txid: buscarTxid,
    titular: buscarTitular,
  };

  return {
    desde,
    setDesde,
    hasta,
    setHasta,
    categoria,
    setCategoria,
    tipoLinea,
    setTipoLinea,
    subFiltro,
    setSubFiltro,
    buscarCbu,
    setBuscarCbu,
    buscarCuit,
    setBuscarCuit,
    buscarTxid,
    setBuscarTxid,
    buscarTitular,
    setBuscarTitular,
    page,
    setPage,
    limpiar,
    query,
  };
}

export type FiltrosHistorialState = ReturnType<typeof useFiltrosHistorial>;
