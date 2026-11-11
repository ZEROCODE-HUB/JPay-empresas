import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { EnviarDolaresCard } from "@/features/dolares/components/EnviarDolaresCard";
import { EnviosDolaresCard } from "@/features/dolares/components/MovimientosDolares";
import { useCuentaSpei } from "@/hooks/useCobre";
import { Cargando, ErrorCarga, EstadoConsulta } from "@/shared/ui/estado-carga";

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
        <Cargando className="block h-40 w-full" />
      ) : error ? (
        <ErrorCarga
          error={error}
          onRetry={() =>
            void Promise.all([cuenta.refetch(), subcuentas.refetch(), destinatarios.refetch()])
          }
        />
      ) : (
        <div className="space-y-4">
          <EnviarDolaresCard
            subcuentas={subcuentas.data ?? []}
            destinatarios={destinatarios.data ?? []}
            habilitada={habilitada}
          />
          <EstadoConsulta q={transferencias}>
            {(t) => <EnviosDolaresCard envios={t.filter((x) => x.moneda === "USD")} />}
          </EstadoConsulta>
        </div>
      )}
    </>
  );
}
