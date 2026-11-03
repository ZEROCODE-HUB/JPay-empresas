import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { useComerciosCliente } from "@/hooks/useComercios";
import { useConexionEcartPay } from "@/hooks/useIntegraciones";
import { SuscripcionesPanel } from "@/shared/ui/suscripciones-panel";

export const Route = createFileRoute("/app/suscripciones")({
  head: () => ({ meta: [{ title: "Suscripciones" }] }),
  component: Page,
});

function Page() {
  const { rows, isLoading: cargandoComercios } = useComerciosCliente();
  const comercioId = rows?.[0]?.id ?? null;
  const conexion = useConexionEcartPay(comercioId);
  const conectado = conexion.data?.estado === "conectado";

  if (cargandoComercios || conexion.isLoading) {
    return <Card className="text-sm text-black-400">Cargando…</Card>;
  }
  if (!comercioId || !conectado) {
    return (
      <>
        <PageHeader
          title="Suscripciones"
          description="Cobrá en forma recurrente con tarjeta: tu cliente agrega su tarjeta en el link de Ecart Pay."
        />
        <Card className="text-sm">
          Primero conectá tu cuenta de Ecart Pay en{" "}
          <Link to="/app/integraciones" className="font-semibold underline">
            Integraciones
          </Link>
          .
        </Card>
      </>
    );
  }
  return (
    <SuscripcionesPanel
      comercioId={comercioId}
      titulo="Suscripciones"
      descripcion="Cobrá en forma recurrente con tarjeta: tu cliente agrega su tarjeta en el link de Ecart Pay."
    />
  );
}
