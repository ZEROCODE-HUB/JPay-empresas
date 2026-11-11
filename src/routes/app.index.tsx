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
import { kpisDesdeResumen, serieDiaria } from "@/features/inicio/utils";
import { ErrorCarga } from "@/shared/ui/estado-carga";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const periodo = usePeriodoDashboard();
  const { range, periodLabel } = periodo;
  const { resumen, cuentaLabel, isLoading, error, refetch } = useDashboard(range.start, range.end);

  const data = useMemo(
    () => serieDiaria(resumen, range.start, range.end),
    [resumen, range.start, range.end],
  );
  const kpis = useMemo(() => kpisDesdeResumen(resumen), [resumen]);

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
        onExport={(fmt) => exportarDashboard(fmt, data, kpis, periodLabel)}
      />

      {error ? (
        <ErrorCarga error={error} onRetry={refetch} />
      ) : (
        <>
          <DashboardKpis kpis={kpis} cuentaLabel={cuentaLabel} loading={isLoading} />
          <MovimientosDiariosChart data={data} periodLabel={periodLabel} loading={isLoading} />
        </>
      )}
    </>
  );
}
