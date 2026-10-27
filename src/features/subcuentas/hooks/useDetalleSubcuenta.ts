import { useMemo, useState } from "react";
import { brand } from "@/brand/brand";
import { useMovimientosSubcuenta } from "@/hooks/useSubcuentas";
import type { FiltroTipoMov, Sub } from "../types";
import { filtrarMovs, mapMovimientos, totalesMovs } from "../utils";

/** Movimientos, filtros y edición local del email del modal de detalle. */
export function useDetalleSubcuenta(sub: Sub) {
  const [editEmail, setEditEmail] = useState(false);
  const [emailVal, setEmailVal] = useState(sub.email);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTipo, setFilterTipo] = useState<FiltroTipoMov>("todos");
  const [filterSearch, setFilterSearch] = useState("");
  const { movimientos, loading: loadingMoves } = useMovimientosSubcuenta(sub.id, sub.cbu);

  const allMoves = useMemo(() => mapMovimientos(movimientos, brand.name), [movimientos]);
  const filtMoves = filtrarMovs(allMoves, filterTipo, filterSearch);
  const { depositos: totalDepositos, retiros: totalRetiros } = totalesMovs(allMoves);

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
    allMoves,
    filtMoves,
    totalDepositos,
    totalRetiros,
  };
}
