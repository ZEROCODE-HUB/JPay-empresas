import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  computeDashboardKPI,
  computeEvolucion,
  computeLotesRecientes,
  computeNoCobradas,
  computePorMedio,
  computePorVencimiento,
  periodFilter,
  type DashboardKPI,
  type NoCobradasData,
  type PeriodFilter,
} from "@/lib/api/cobros-masivos";
import { finDiaLocal, inicioDiaLocal } from "../../utils";

const KPI_VACIO: DashboardKPI = {
  totalLotes: 0,
  enProceso: 0,
  finalizados: 0,
  conError: 0,
  montoTotal: 0,
  montoCobrado: 0,
  montoPendiente: 0,
};

const NO_COBRADAS_VACIO: NoCobradasData = {
  totalOperaciones: 0,
  vencidas: 0,
  vigentes: 0,
  montoNoCobrado: 0,
  porcentajeNoCobrado: 0,
};

/** Período del dashboard (presets o rango personalizado) y todos sus datos. */
export function useDashboardCobros() {
  const [filter, setFilter] = useState<PeriodFilter>(periodFilter("30 dias", 30));
  const [customDesde, setCustomDesde] = useState("");
  const [customHasta, setCustomHasta] = useState("");

  const q = useQuery({
    queryKey: ["cobros", "dashboard", filter.from.toISOString(), filter.to.toISOString()],
    queryFn: async () => {
      const [kpi, porMedio, porVencimiento, noCobradas, evolucion, lotesRecientes] =
        await Promise.all([
          computeDashboardKPI(filter),
          computePorMedio(filter),
          computePorVencimiento(filter),
          computeNoCobradas(filter),
          computeEvolucion(filter),
          computeLotesRecientes(filter),
        ]);
      return { kpi, porMedio, porVencimiento, noCobradas, evolucion, lotesRecientes };
    },
    placeholderData: keepPreviousData,
    meta: { silencioso: true },
  });
  const d = q.data;

  const elegirPreset = (label: string, days: number) => setFilter(periodFilter(label, days));

  /** Al completar ambas fechas se aplica el rango personalizado. */
  const cambiarDesde = (v: string) => {
    setCustomDesde(v);
    if (v && customHasta) {
      setFilter(
        periodFilter("Personalizado", undefined, inicioDiaLocal(v), finDiaLocal(customHasta)),
      );
    }
  };
  const cambiarHasta = (v: string) => {
    setCustomHasta(v);
    if (customDesde && v) {
      setFilter(
        periodFilter("Personalizado", undefined, inicioDiaLocal(customDesde), finDiaLocal(v)),
      );
    }
  };

  return {
    filter,
    elegirPreset,
    customDesde,
    customHasta,
    cambiarDesde,
    cambiarHasta,
    kpi: d?.kpi ?? KPI_VACIO,
    porMedio: d?.porMedio ?? [],
    porVencimiento: d?.porVencimiento ?? [],
    noCobradas: d?.noCobradas ?? NO_COBRADAS_VACIO,
    evolucion: d?.evolucion ?? [],
    lotesRecientes: d?.lotesRecientes ?? [],
    isLoading: q.isPending,
    error: q.isError && !d ? q.error : null,
    refetch: () => void q.refetch(),
  };
}
