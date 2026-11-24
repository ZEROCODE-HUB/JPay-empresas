import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { ConectaCobreAviso } from "@/features/integraciones/components/ConectaCobreAviso";
import { EnviarDolaresCard } from "@/features/dolares/components/EnviarDolaresCard";
import { EnviosDolaresCard } from "@/features/dolares/components/MovimientosDolares";
import { useCuentaSpei, useTransferencias } from "@/hooks/useCobre";
import { Cargando, ErrorCarga, EstadoConsulta } from "@/shared/ui/estado-carga";

export const Route = createFileRoute("/app/enviar/dolares")({
  head: () => ({ meta: [{ title: "Envíos en dólares" }] }),
  component: Page,
});

function Page() {
  const { cuenta, subcuentas, destinatarios } = useCuentaSpei();
  const transferencias = useTransferencias("USD");
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
      ) : !cuenta.data?.cuenta ? (
        <ConectaCobreAviso cuenta={cuenta.data} para="enviar dólares" />
      ) : (
        <div className="space-y-4">
          {cuenta.data?.instanciaPropia && (
            <Card className="text-sm text-black-500">
              Los dólares todavía no están disponibles con tu cuenta Cobre conectada: por ahora solo
              puedes operar en pesos.
            </Card>
          )}
          <EnviarDolaresCard
            subcuentas={subcuentas.data ?? []}
            destinatarios={destinatarios.data ?? []}
            habilitada={habilitada}
          />
          <EstadoConsulta q={transferencias}>
            {(t) => <EnviosDolaresCard envios={t} />}
          </EstadoConsulta>
        </div>
      )}
    </>
  );
}
