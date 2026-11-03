import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/portal-shell";
import { useComerciosCliente } from "@/hooks/useComercios";
import { useConexionEcartPay } from "@/hooks/useIntegraciones";
import { PuntosFisicosPanel } from "@/shared/ui/puntos-fisicos-panel";

export const Route = createFileRoute("/app/puntos-fisicos")({
  head: () => ({ meta: [{ title: "Puntos físicos" }] }),
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
        <PageHeader title="Puntos físicos" description="Sucursales, cajas y terminales." />
        <Card className="text-sm">
          Para gestionar puntos físicos primero conectá tu cuenta de Ecart Pay en{" "}
          <Link to="/app/integraciones" className="font-semibold underline">
            Integraciones
          </Link>
          .
        </Card>
      </>
    );
  }
  return (
    <PuntosFisicosPanel
      comercioId={comercioId}
      titulo="Puntos físicos"
      descripcion="Sucursales, cajas y terminales de tu cuenta de Ecart Pay."
    />
  );
}
