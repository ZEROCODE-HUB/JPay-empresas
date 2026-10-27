import { useState } from "react";
import { agruparPorTxid, type Linea } from "../utils";

/** "Agrupar desglose por TXID" y qué grupos están desplegados. */
export function useGruposTxid(lineas: Linea[]) {
  const [agrupar, setAgrupar] = useState(true);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const toggleGrupo = (idTxn: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(idTxn)) next.delete(idTxn);
      else next.add(idTxn);
      return next;
    });

  return {
    agrupar,
    setAgrupar,
    abiertos,
    toggleGrupo,
    filas: agruparPorTxid(lineas, agrupar, abiertos),
  };
}

export type GruposTxid = ReturnType<typeof useGruposTxid>;
