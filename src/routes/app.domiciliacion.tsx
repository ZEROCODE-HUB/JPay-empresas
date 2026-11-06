import { createFileRoute } from "@tanstack/react-router";
import { RequiereEcartPay } from "@/features/integraciones/components/RequiereEcartPay";
import { DomiciliacionesPanel } from "@/shared/ui/domiciliaciones-panel";

export const Route = createFileRoute("/app/domiciliacion")({
  head: () => ({ meta: [{ title: "Domiciliación" }] }),
  component: Page,
});

const DESCRIPCION = "Cargos recurrentes o únicos a la CLABE de tus clientes, con su aceptación.";

function Page() {
  return (
    <RequiereEcartPay titulo="Domiciliación" descripcion={DESCRIPCION}>
      {(comercioId) => (
        <DomiciliacionesPanel
          comercioId={comercioId}
          titulo="Domiciliación"
          descripcion={DESCRIPCION}
        />
      )}
    </RequiereEcartPay>
  );
}
