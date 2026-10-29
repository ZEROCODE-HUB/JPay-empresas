import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { ConvertirCard } from "@/features/dolares/components/ConvertirCard";
import { EnviarDolaresCard } from "@/features/dolares/components/EnviarDolaresCard";
import { MovimientosDolaresCard } from "@/features/dolares/components/MovimientosDolaresCard";
import { useCuentaSpei, useDolares } from "@/hooks/useCobre";

export const Route = createFileRoute("/app/dolares")({
  head: () => ({ meta: [{ title: "Dólares" }] }),
  component: Page,
});

function Page() {
  const { cuenta, subcuentas, destinatarios, transferencias } = useCuentaSpei();
  const { conversiones } = useDolares();
  const error = cuenta.error ?? subcuentas.error ?? destinatarios.error;
  // Los dólares son por la cuenta de JPay: un comercio con instancia Cobre propia no los usa acá.
  const habilitada = !!cuenta.data?.cuenta && !cuenta.data.instanciaPropia;
  return (
    <>
      <PageHeader
        title="Dólares"
        description="Convertí pesos a dólares y pagá a cuentas en Estados Unidos (Fedwire) o en otros países (SWIFT)."
      />
      {cuenta.isLoading || subcuentas.isLoading || destinatarios.isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">
          No se pudo cargar: {(error as Error).message}
        </Card>
      ) : (
        <div className="space-y-4">
          <ConvertirCard subcuentas={subcuentas.data ?? []} habilitada={habilitada} />
          <EnviarDolaresCard
            subcuentas={subcuentas.data ?? []}
            destinatarios={destinatarios.data ?? []}
            habilitada={habilitada}
          />
          <MovimientosDolaresCard
            conversiones={conversiones.data ?? []}
            envios={(transferencias.data ?? []).filter((t) => t.moneda === "USD")}
          />
        </div>
      )}
    </>
  );
}
