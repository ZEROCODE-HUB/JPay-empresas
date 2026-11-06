import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { ConvertirCard } from "@/features/dolares/components/ConvertirCard";
import { ConversionesCard } from "@/features/dolares/components/MovimientosDolares";
import { useCuentaSpei, useDolares } from "@/hooks/useCobre";

export const Route = createFileRoute("/app/dolares")({
  head: () => ({ meta: [{ title: "Dólares" }] }),
  component: Page,
});

function Page() {
  const { cuenta, subcuentas } = useCuentaSpei();
  const { conversiones } = useDolares();
  const error = cuenta.error ?? subcuentas.error;
  // Los dólares son por la cuenta de JPay: un comercio con instancia Cobre propia no los usa aquí.
  const habilitada = !!cuenta.data?.cuenta && !cuenta.data.instanciaPropia;
  return (
    <>
      <PageHeader
        title="Dólares"
        description="Convierte pesos a dólares. Para pagar a cuentas en Estados Unidos o en otros países, usa Enviar › Envíos en dólares."
      />
      {cuenta.isLoading || subcuentas.isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">
          No se pudo cargar: {(error as Error).message}
        </Card>
      ) : (
        <div className="space-y-4">
          <ConvertirCard subcuentas={subcuentas.data ?? []} habilitada={habilitada} />
          <ConversionesCard conversiones={conversiones.data ?? []} />
        </div>
      )}
    </>
  );
}
