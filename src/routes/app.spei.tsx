import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { ClabesCard } from "@/features/spei/components/ClabesCard";
import { MovimientosSpeiCard } from "@/features/spei/components/MovimientosSpeiCard";
import { TransferirSpeiCard } from "@/features/spei/components/TransferirSpeiCard";
import { useCuentaSpei } from "@/hooks/useCobre";

export const Route = createFileRoute("/app/spei")({
  head: () => ({ meta: [{ title: "Transferencias SPEI" }] }),
  component: Page,
});

function Page() {
  const { subcuentas, destinatarios, transferencias, depositos } = useCuentaSpei();
  const error = subcuentas.error ?? destinatarios.error;
  return (
    <>
      <PageHeader
        title="Transferencias SPEI"
        description="Recibí dinero en la CLABE de cada subcuenta y transferí a cualquier banco de México."
      />
      {subcuentas.isLoading || destinatarios.isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">
          No se pudo cargar: {(error as Error).message}
        </Card>
      ) : (
        <div className="space-y-4">
          <ClabesCard subcuentas={subcuentas.data ?? []} />
          <TransferirSpeiCard
            subcuentas={subcuentas.data ?? []}
            destinatarios={destinatarios.data ?? []}
          />
          <MovimientosSpeiCard
            transferencias={transferencias.data ?? []}
            depositos={depositos.data ?? []}
          />
        </div>
      )}
    </>
  );
}
