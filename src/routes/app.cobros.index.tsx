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
import { Cargando, ErrorCarga } from "@/shared/ui/estado-carga";

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

      {d.error ? (
        <ErrorCarga error={d.error} onRetry={d.refetch} />
      ) : (
        <>
          <DashboardKpis kpi={d.kpi} loading={d.isLoading} />

          {d.isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {[0, 1, 2].map((i) => (
                <Cargando key={i} className="block h-64 w-full" />
              ))}
            </div>
          ) : (
            <>
              <DashboardGraficos
                porMedio={d.porMedio}
                porVencimiento={d.porVencimiento}
                noCobradas={d.noCobradas}
              />
              <EvolucionPagos evolucion={d.evolucion} />
            </>
          )}

          <LotesRecientes
            cargando={d.isLoading}
            lotes={d.lotesRecientes}
            onVerTodos={() => navigate({ to: "/app/cobros/gestion" })}
            onVer={(id) => navigate({ to: "/app/cobros/lote/$id", params: { id } })}
          />
        </>
      )}
    </div>
  );
}
