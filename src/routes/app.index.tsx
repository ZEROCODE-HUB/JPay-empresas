import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/portal-shell";
import { useDashboard } from "@/hooks/useMovimientos";
import { AccesosRapidos } from "@/features/inicio/components/AccesosRapidos";
import { DashboardKpis } from "@/features/inicio/components/DashboardKpis";
import { KpisProveedores } from "@/features/inicio/components/KpisProveedores";
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
  const { movs, saldoTotal, cuentas, cuentaLabel } = useDashboard(range.start, range.end);

  const data = useMemo(
    () => agruparPorDia(movs, range.start, range.end),
    [movs, range.start, range.end],
  );
  const kpis = useMemo(() => calcularKpis(movs, saldoTotal, cuentas), [movs, saldoTotal, cuentas]);

  return (
    <>
      <PageHeader
        title="Inicio"
        description="Panel ejecutivo — estado de tu operación financiera."
        action={
          <div className="hidden md:flex items-center gap-2 text-xs text-black-400">
            <Clock size={14} /> Datos en vivo
          </div>
        }
      />

      <AccesosRapidos />

      <PeriodoSelector
        p={periodo}
        onExport={(fmt) => exportarDashboard(fmt, movs, kpis, periodLabel)}
      />

      <DashboardKpis kpis={kpis} cuentaLabel={cuentaLabel}>
        <KpisProveedores range={range} />
      </DashboardKpis>

      <MovimientosDiariosChart data={data} periodLabel={periodLabel} />
    </>
  );
}
