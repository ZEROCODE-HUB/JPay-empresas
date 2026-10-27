import { useMemo, useState } from "react";
import { calcularRango, etiquetaPeriodo, toKey, type PeriodKey } from "../utils";

/** Período elegido en el dashboard (atajo, día específico o rango) y su rango de fechas. */
export function usePeriodoDashboard() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [day, setDay] = useState(() => toKey(new Date()));
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const range = useMemo(
    () => calcularRango(period, day, desde, hasta),
    [period, day, desde, hasta],
  );
  const periodLabel = useMemo(
    () => etiquetaPeriodo(period, day, desde, hasta),
    [period, day, desde, hasta],
  );

  return {
    period,
    setPeriod,
    day,
    setDay,
    desde,
    setDesde,
    hasta,
    setHasta,
    range,
    periodLabel,
  };
}

export type PeriodoDashboard = ReturnType<typeof usePeriodoDashboard>;
