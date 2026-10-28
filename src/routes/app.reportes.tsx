import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { useReporteCobros } from "@/hooks/useIntegraciones";
import { ReporteCobrosView } from "@/shared/ui/reporte-cobros";
import { useRangoCobros } from "@/shared/use-rango-cobros";

export const Route = createFileRoute("/app/reportes")({
  head: () => ({ meta: [{ title: "Reportes de cobros" }] }),
  component: Page,
});

function Page() {
  const rango = useRangoCobros();
  const { data, isLoading, error } = useReporteCobros(rango.rango);
  return (
    <>
      <PageHeader
        title="Reportes de cobros"
        description="Lo que cobraste con Ecart Pay: por día, medio de pago, sucursal y caja, con comisiones, reembolsos y contracargos."
      />
      <Card>
        <ReporteCobrosView rango={rango} data={data} isLoading={isLoading} error={error} />
      </Card>
    </>
  );
}
