import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { FiltroPeriodoQr } from "@/features/qr/dashboard/components/FiltroPeriodoQr";
import { GraficosQr } from "@/features/qr/dashboard/components/GraficosQr";
import { KpisQr } from "@/features/qr/dashboard/components/KpisQr";
import { exportarDashboardQrExcel, exportarDashboardQrPdf } from "@/features/qr/dashboard/export";
import { usePeriodoQr } from "@/features/qr/dashboard/hooks/usePeriodoQr";

export const Route = createFileRoute("/app/qr/dashboard")({ component: Dashboard });

function Dashboard() {
  const { presetLabel, setPresetLabel, loading, ...d } = usePeriodoQr();

  return (
    <div>
      <PageHeader
        title="Cobros con QR"
        description="Cobra presencialmente con QR interoperables compatibles con cualquier billetera."
      />

      <FiltroPeriodoQr
        presetLabel={presetLabel}
        setPresetLabel={setPresetLabel}
        exportExcel={() => exportarDashboardQrExcel(d, presetLabel)}
        exportPDF={() => exportarDashboardQrPdf(d, presetLabel)}
      />

      {loading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Cargando…</div>
      ) : (
        <>
          <KpisQr kpis={d.kpis} />
          <GraficosQr statusData={d.statusData} pdvData={d.pdvData} evolucion={d.evolucion} />
        </>
      )}
    </div>
  );
}
