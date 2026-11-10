import { createFileRoute } from "@tanstack/react-router";
import { RequiereEcartPay } from "@/features/integraciones/components/RequiereEcartPay";
import { PuntosFisicosPanel } from "@/shared/ui/puntos-fisicos-panel";

export const Route = createFileRoute("/app/puntos-fisicos")({
  head: () => ({ meta: [{ title: "Puntos físicos" }] }),
  component: Page,
});

function Page() {
  return (
    <RequiereEcartPay
      titulo="Puntos físicos"
      descripcion="Sucursales, cajas y terminales."
      aviso="Para gestionar puntos físicos primero activa los cobros con tarjeta en"
    >
      {(comercioId) => (
        <PuntosFisicosPanel
          comercioId={comercioId}
          titulo="Puntos físicos"
          descripcion="Sucursales, cajas y terminales de tu cuenta de cobros con tarjeta."
        />
      )}
    </RequiereEcartPay>
  );
}
