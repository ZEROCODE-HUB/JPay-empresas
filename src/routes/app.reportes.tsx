import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, PageHeader } from "@/components/portal-shell";
import { LinksPagoResumen } from "@/features/link-pago/dashboard/LinksPagoResumen";
import { MovimientosSpeiCard } from "@/features/spei/components/MovimientosSpeiCard";
import { useCuentaSpei } from "@/hooks/useCobre";
import { useReporteCobros } from "@/hooks/useIntegraciones";
import { usePaisConModulos } from "@/shared/modulos-pais";
import { filtrarPorModulo, type Modulo } from "@/shared/pais";
import { ReporteCobrosView } from "@/shared/ui/reporte-cobros";
import { SeccionTabs } from "@/shared/ui/seccion-tabs";
import { useRangoCobros } from "@/shared/use-rango-cobros";

type Tab = "tarjeta" | "spei" | "links";
const TABS: { id: Tab; label: string; descripcion: string; modulo?: Modulo }[] = [
  {
    id: "tarjeta",
    label: "Cobros con tarjeta",
    descripcion:
      "Lo que cobraste con tarjeta, SPEI y OXXO: por día, medio de pago, sucursal y caja, con comisiones, reembolsos y contracargos.",
    modulo: "pagos_proveedor",
  },
  {
    id: "spei",
    label: "SPEI",
    descripcion: "Depósitos recibidos en tu CLABE y transferencias SPEI enviadas.",
    modulo: "transferencias_cobre",
  },
  {
    id: "links",
    label: "Links de pago",
    descripcion: "Cobros con tus links de pago: aprobados, pendientes, rechazados y reembolsos.",
  },
];

export const Route = createFileRoute("/app/reportes")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: s.tab === "tarjeta" || s.tab === "spei" || s.tab === "links" ? s.tab : undefined,
  }),
  head: () => ({ meta: [{ title: "Reportes" }] }),
  component: Page,
});

function Page() {
  const pais = usePaisConModulos();
  const tabs = useMemo(() => filtrarPorModulo(TABS, pais), [pais]);
  const { tab: buscada } = Route.useSearch();
  const navigate = useNavigate();
  const actual = tabs.find((t) => t.id === buscada) ?? tabs[0];

  return (
    <>
      <PageHeader title="Reportes" description={actual.descripcion} />
      {tabs.length > 1 && (
        <SeccionTabs
          tabs={tabs}
          value={actual.id}
          onChange={(t) => navigate({ to: "/app/reportes", search: { tab: t }, replace: true })}
        />
      )}
      {actual.id === "tarjeta" && <ReporteTarjeta />}
      {actual.id === "spei" && <ReporteSpei />}
      {actual.id === "links" && <LinksPagoResumen />}
    </>
  );
}

function ReporteTarjeta() {
  const rango = useRangoCobros();
  const { data, isLoading, error } = useReporteCobros(rango.rango);
  return (
    <Card>
      <ReporteCobrosView rango={rango} data={data} isLoading={isLoading} error={error} />
    </Card>
  );
}

function ReporteSpei() {
  const { transferencias, depositos } = useCuentaSpei();
  if (transferencias.isLoading || depositos.isLoading) {
    return <Card className="text-sm text-black-400">Cargando…</Card>;
  }
  const error = transferencias.error ?? depositos.error;
  if (error) {
    return (
      <Card className="text-sm text-danger-600">No se pudo cargar: {(error as Error).message}</Card>
    );
  }
  return (
    <MovimientosSpeiCard
      transferencias={(transferencias.data ?? []).filter((t) => t.moneda === "MXN")}
      depositos={depositos.data ?? []}
    />
  );
}
