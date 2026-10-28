/**
 * Período elegido para el reporte de cobros (predefinido o a mano).
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 */
import { useState } from "react";
import { rangoPeriodo, type PeriodoCobros } from "./reporte-cobros";

export type RangoCobros = { desde: string; hasta: string };

/** Período elegido (predefinido o a mano). Arranca en "Este mes". */
export function useRangoCobros() {
  const [periodo, setPeriodo] = useState<PeriodoCobros | "otro">("mes");
  const [rango, setRango] = useState<RangoCobros>(() => rangoPeriodo("mes"));
  const elegir = (p: PeriodoCobros | "otro") => {
    setPeriodo(p);
    if (p !== "otro") setRango(rangoPeriodo(p));
  };
  return { periodo, rango, elegir, setRango };
}
