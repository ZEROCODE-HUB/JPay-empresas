import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  DashboardGraficos,
  EvolucionPagos,
} from "@/features/cobros/dashboard/components/DashboardGraficos";
import { DashboardFiltros } from "@/features/cobros/dashboard/components/DashboardFiltros";
import { DashboardKpis } from "@/features/cobros/dashboard/components/DashboardKpis";
import { LotesRecientes } from "@/features/cobros/dashboard/components/LotesRecientes";
import { useDashboardCobros } from "@/features/cobros/dashboard/hooks/useDashboardCobros";
import { exportarDashboardExcel, exportarDashboardPdf } from "@/features/cobros/export";

export const Route = createFileRoute("/app/cobros/")({ component: Dashboard });

function Dashboard() {
  const navigate = useNavigate();
  const d = useDashboardCobros();

  return (
    <div>
      <DashboardFiltros
        periodo={d.filter.label}
        onPreset={d.elegirPreset}
        desde={d.customDesde}
        hasta={d.customHasta}
        onDesde={d.cambiarDesde}
        onHasta={d.cambiarHasta}
        onExcel={() => exportarDashboardExcel(d, d.filter.label)}
        onPdf={() => exportarDashboardPdf(d.kpi, d.filter.label)}
      />

      <DashboardKpis kpi={d.kpi} />

      <DashboardGraficos
        porMedio={d.porMedio}
        porVencimiento={d.porVencimiento}
        noCobradas={d.noCobradas}
      />

      <EvolucionPagos evolucion={d.evolucion} />

      <LotesRecientes
        lotes={d.lotesRecientes}
        onVerTodos={() => navigate({ to: "/app/cobros/gestion" })}
        onVer={(id) => navigate({ to: "/app/cobros/lote/$id", params: { id } })}
      />
    </div>
  );
}
