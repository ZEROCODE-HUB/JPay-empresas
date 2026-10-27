import { useEffect, useState } from "react";
import {
  computeDashboardKPI,
  computeEvolucion,
  computeLotesRecientes,
  computeNoCobradas,
  computePorMedio,
  computePorVencimiento,
  periodFilter,
  type DashboardKPI,
  type EvolucionData,
  type LoteResumen,
  type MedioPagoData,
  type NoCobradasData,
  type PeriodFilter,
  type VencimientoData,
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

  const [kpi, setKpi] = useState<DashboardKPI>(KPI_VACIO);
  const [porMedio, setPorMedio] = useState<MedioPagoData[]>([]);
  const [porVencimiento, setPorVencimiento] = useState<VencimientoData[]>([]);
  const [noCobradas, setNoCobradas] = useState<NoCobradasData>(NO_COBRADAS_VACIO);
  const [evolucion, setEvolucion] = useState<EvolucionData[]>([]);
  const [lotesRecientes, setLotesRecientes] = useState<LoteResumen[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [k, pm, pv, nc, ev, lr] = await Promise.all([
        computeDashboardKPI(filter),
        computePorMedio(filter),
        computePorVencimiento(filter),
        computeNoCobradas(filter),
        computeEvolucion(filter),
        computeLotesRecientes(filter),
      ]);
      if (!cancelled) {
        setKpi(k);
        setPorMedio(pm);
        setPorVencimiento(pv);
        setNoCobradas(nc);
        setEvolucion(ev);
        setLotesRecientes(lr);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);

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
    kpi,
    porMedio,
    porVencimiento,
    noCobradas,
    evolucion,
    lotesRecientes,
  };
}
