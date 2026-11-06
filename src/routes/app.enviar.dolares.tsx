import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { EnviarDolaresCard } from "@/features/dolares/components/EnviarDolaresCard";
import { EnviosDolaresCard } from "@/features/dolares/components/MovimientosDolares";
import { useCuentaSpei } from "@/hooks/useCobre";

export const Route = createFileRoute("/app/enviar/dolares")({
  head: () => ({ meta: [{ title: "Envíos en dólares" }] }),
  component: Page,
});

function Page() {
  const { cuenta, subcuentas, destinatarios, transferencias } = useCuentaSpei();
  const error = cuenta.error ?? subcuentas.error ?? destinatarios.error;
  // Los dólares son por la cuenta de JPay: un comercio con instancia Cobre propia no los usa aquí.
  const habilitada = !!cuenta.data?.cuenta && !cuenta.data.instanciaPropia;
  return (
    <>
      <PageHeader
        title="Envíos en dólares"
        description="Paga a cuentas en Estados Unidos (Fedwire) o en otros países (SWIFT) con tu saldo en dólares."
      />
      {cuenta.isLoading || subcuentas.isLoading || destinatarios.isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">
          No se pudo cargar: {(error as Error).message}
        </Card>
      ) : (
        <div className="space-y-4">
          <EnviarDolaresCard
            subcuentas={subcuentas.data ?? []}
            destinatarios={destinatarios.data ?? []}
            habilitada={habilitada}
          />
          <EnviosDolaresCard
            envios={(transferencias.data ?? []).filter((t) => t.moneda === "USD")}
          />
        </div>
      )}
    </>
  );
}
