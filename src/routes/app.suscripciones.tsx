import { createFileRoute } from "@tanstack/react-router";
import { RequiereEcartPay } from "@/features/integraciones/components/RequiereEcartPay";
import { SuscripcionesPanel } from "@/shared/ui/suscripciones-panel";

export const Route = createFileRoute("/app/suscripciones")({
  head: () => ({ meta: [{ title: "Suscripciones" }] }),
  component: Page,
});

const DESCRIPCION =
  "Cobra en forma recurrente con tarjeta: tu cliente agrega su tarjeta en un link de pago seguro.";

function Page() {
  return (
    <RequiereEcartPay titulo="Suscripciones" descripcion={DESCRIPCION}>
      {(comercioId) => (
        <SuscripcionesPanel
          comercioId={comercioId}
          titulo="Suscripciones"
          descripcion={DESCRIPCION}
        />
      )}
    </RequiereEcartPay>
  );
}
