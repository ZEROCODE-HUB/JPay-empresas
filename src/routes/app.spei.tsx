import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { ClabesCard } from "@/features/spei/components/ClabesCard";
import { LoteSpeiCard } from "@/features/spei/components/LoteSpeiCard";
import { MovimientosSpeiCard } from "@/features/spei/components/MovimientosSpeiCard";
import { TransferirSpeiCard } from "@/features/spei/components/TransferirSpeiCard";
import { useCuentaSpei } from "@/hooks/useCobre";

export const Route = createFileRoute("/app/spei")({
  head: () => ({ meta: [{ title: "Transferencias SPEI" }] }),
  component: Page,
});

function Page() {
  const { cuenta, subcuentas, destinatarios, transferencias, lotes, depositos } = useCuentaSpei();
  const error = cuenta.error ?? subcuentas.error ?? destinatarios.error;
  const habilitada = !!cuenta.data?.cuenta && cuenta.data.cuenta.conectividad !== "processing";
  return (
    <>
      <PageHeader
        title="Transferencias SPEI"
        description="Recibí dinero en la CLABE de tu cuenta y transferí a cualquier banco de México, uno a uno o en lote."
      />
      {cuenta.isLoading || subcuentas.isLoading || destinatarios.isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">
          No se pudo cargar: {(error as Error).message}
        </Card>
      ) : (
        <div className="space-y-4">
          <ClabesCard cuenta={cuenta.data!} subcuentas={subcuentas.data ?? []} />
          <TransferirSpeiCard
            subcuentas={subcuentas.data ?? []}
            destinatarios={destinatarios.data ?? []}
            habilitada={habilitada}
          />
          <LoteSpeiCard
            subcuentas={subcuentas.data ?? []}
            destinatarios={destinatarios.data ?? []}
            lotes={lotes.data ?? []}
            habilitada={habilitada}
          />
          <MovimientosSpeiCard
            transferencias={(transferencias.data ?? []).filter((t) => t.moneda === "MXN")}
            depositos={depositos.data ?? []}
          />
        </div>
      )}
    </>
  );
}
