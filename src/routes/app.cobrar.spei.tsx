import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { ClabesCard } from "@/features/spei/components/ClabesCard";
import { CobrosR2pCard } from "@/features/spei/components/CobrosR2pCard";
import { DepositosSpeiCard } from "@/features/spei/components/MovimientosSpeiCard";
import { useCuentaSpei } from "@/hooks/useCobre";

export const Route = createFileRoute("/app/cobrar/spei")({
  head: () => ({ meta: [{ title: "Cobros por SPEI" }] }),
  component: Page,
});

function Page() {
  const { cuenta, subcuentas, depositos } = useCuentaSpei();
  const error = cuenta.error ?? subcuentas.error;
  return (
    <>
      <PageHeader
        title="Cobros por SPEI"
        description="Recibe dinero en la CLABE de tu cuenta o genera una CLABE de un solo uso, por un monto y con vencimiento, para que te paguen por transferencia."
      />
      {cuenta.isLoading || subcuentas.isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">
          No se pudo cargar: {(error as Error).message}
        </Card>
      ) : (
        <div className="space-y-4">
          <ClabesCard cuenta={cuenta.data!} subcuentas={subcuentas.data ?? []} />
          <CobrosR2pCard subcuentas={subcuentas.data ?? []} habilitada={!!cuenta.data?.cuenta} />
          <DepositosSpeiCard depositos={depositos.data ?? []} />
        </div>
      )}
    </>
  );
}
