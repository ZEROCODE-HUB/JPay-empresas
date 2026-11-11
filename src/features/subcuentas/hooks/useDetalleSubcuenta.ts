import { useMemo, useState } from "react";
import { brand } from "@/brand/brand";
import { useMovimientosSubcuenta } from "@/hooks/useSubcuentas";
import type { FiltroTipoMov, Sub } from "../types";
import { filtrarMovs, mapMovimientos } from "../utils";

/** Movimientos, filtros y edición local del email del modal de detalle. */
export function useDetalleSubcuenta(sub: Sub) {
  const [editEmail, setEditEmail] = useState(false);
  const [emailVal, setEmailVal] = useState(sub.email);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTipo, setFilterTipo] = useState<FiltroTipoMov>("todos");
  const [filterSearch, setFilterSearch] = useState("");
  const {
    movimientos,
    totales,
    loading: loadingMoves,
    error: errorMoves,
  } = useMovimientosSubcuenta(sub.id);

  const allMoves = useMemo(() => mapMovimientos(movimientos, brand.name), [movimientos]);
  const filtMoves = filtrarMovs(allMoves, filterTipo, filterSearch);
  // Totales de toda la historia de la subcuenta (la base), no solo de los últimos 200.
  const totalDepositos = Number(totales?.entradas ?? 0);
  const totalRetiros = Number(totales?.salidas ?? 0);

  return {
    editEmail,
    setEditEmail,
    emailVal,
    setEmailVal,
    filterOpen,
    setFilterOpen,
    filterTipo,
    setFilterTipo,
    filterSearch,
    setFilterSearch,
    loadingMoves,
    errorMoves,
    allMoves,
    filtMoves,
    totalDepositos,
    totalRetiros,
  };
}
