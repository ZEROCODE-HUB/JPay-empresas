import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { LoteSpeiCard } from "@/features/spei/components/LoteSpeiCard";
import { TransferenciasSpeiCard } from "@/features/spei/components/MovimientosSpeiCard";
import { TransferirSpeiCard } from "@/features/spei/components/TransferirSpeiCard";
import { useCuentaSpei } from "@/hooks/useCobre";
import { Cargando, ErrorCarga, EstadoConsulta } from "@/shared/ui/estado-carga";

export const Route = createFileRoute("/app/enviar/spei")({
  head: () => ({ meta: [{ title: "Transferencias SPEI" }] }),
  component: Page,
});

function Page() {
  const { cuenta, subcuentas, destinatarios, transferencias, lotes } = useCuentaSpei();
  const error = cuenta.error ?? subcuentas.error ?? destinatarios.error;
  const habilitada = !!cuenta.data?.cuenta && cuenta.data.cuenta.conectividad !== "processing";
  return (
    <>
      <PageHeader
        title="Transferencias SPEI"
        description="Transfiere a cualquier banco de México, una a una o en lote, y guarda tus destinatarios."
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
          <TransferirSpeiCard
            subcuentas={subcuentas.data ?? []}
            destinatarios={destinatarios.data ?? []}
            habilitada={habilitada}
          />
          <EstadoConsulta q={lotes}>
            {(l) => (
              <LoteSpeiCard
                subcuentas={subcuentas.data ?? []}
                destinatarios={destinatarios.data ?? []}
                lotes={l}
                habilitada={habilitada}
              />
            )}
          </EstadoConsulta>
          <EstadoConsulta q={transferencias}>
            {(t) => <TransferenciasSpeiCard transferencias={t.filter((x) => x.moneda === "MXN")} />}
          </EstadoConsulta>
        </div>
      )}
    </>
  );
}
