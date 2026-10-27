import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/portal-shell";
import { useDashboard } from "@/hooks/useMovimientos";
import { DashboardKpis } from "@/features/inicio/components/DashboardKpis";
import { MovimientosDiariosChart } from "@/features/inicio/components/MovimientosDiariosChart";
import { PeriodoSelector } from "@/features/inicio/components/PeriodoSelector";
import { exportarDashboard } from "@/features/inicio/export";
import { usePeriodoDashboard } from "@/features/inicio/hooks/usePeriodoDashboard";
import { agruparPorDia, calcularKpis } from "@/features/inicio/utils";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const periodo = usePeriodoDashboard();
  const { range, periodLabel } = periodo;
  const { movs, saldoTotal, cuentas, cbuLabel } = useDashboard(range.start, range.end);

  const data = useMemo(
    () => agruparPorDia(movs, range.start, range.end),
    [movs, range.start, range.end],
  );
  const kpis = useMemo(() => calcularKpis(movs, saldoTotal, cuentas), [movs, saldoTotal, cuentas]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Panel ejecutivo — estado de tu operación financiera."
        action={
          <div className="hidden md:flex items-center gap-2 text-xs text-black-400">
            <Clock size={14} /> Datos en vivo
          </div>
        }
      />

      <PeriodoSelector
        p={periodo}
        onExport={(fmt) => exportarDashboard(fmt, movs, kpis, periodLabel)}
      />

      <DashboardKpis kpis={kpis} cbuLabel={cbuLabel} />

      <MovimientosDiariosChart data={data} periodLabel={periodLabel} />
    </>
  );
}
