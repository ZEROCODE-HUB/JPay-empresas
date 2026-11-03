import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { useComerciosCliente } from "@/hooks/useComercios";
import { useConexionEcartPay } from "@/hooks/useIntegraciones";
import { DomiciliacionesPanel } from "@/shared/ui/domiciliaciones-panel";

export const Route = createFileRoute("/app/domiciliacion")({
  head: () => ({ meta: [{ title: "Domiciliación" }] }),
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
          title="Domiciliación"
          description="Cargos recurrentes o únicos a la CLABE de tus clientes, con su aceptación."
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
    <DomiciliacionesPanel
      comercioId={comercioId}
      titulo="Domiciliación"
      descripcion="Cargos recurrentes o únicos a la CLABE de tus clientes, con su aceptación."
    />
  );
}
