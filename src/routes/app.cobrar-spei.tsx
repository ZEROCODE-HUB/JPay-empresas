import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { CobrosR2pCard } from "@/features/spei/components/CobrosR2pCard";
import { useCuentaSpei } from "@/hooks/useCobre";

export const Route = createFileRoute("/app/cobrar-spei")({
  head: () => ({ meta: [{ title: "Cobrar por SPEI" }] }),
  component: Page,
});

function Page() {
  const { cuenta, subcuentas } = useCuentaSpei();
  const error = cuenta.error ?? subcuentas.error;
  return (
    <>
      <PageHeader
        title="Cobrar por SPEI"
        description="Generá una CLABE de un solo uso, por un monto y con vencimiento, para que te paguen por transferencia."
      />
      {cuenta.isLoading || subcuentas.isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">
          No se pudo cargar: {(error as Error).message}
        </Card>
      ) : (
        <CobrosR2pCard subcuentas={subcuentas.data ?? []} habilitada={!!cuenta.data?.cuenta} />
      )}
    </>
  );
}
