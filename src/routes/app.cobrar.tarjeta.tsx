import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { CobrosEcartPayCard } from "@/features/integraciones/components/CobrosEcartPayCard";
import { RequiereEcartPay } from "@/features/integraciones/components/RequiereEcartPay";

export const Route = createFileRoute("/app/cobrar/tarjeta")({
  head: () => ({ meta: [{ title: "Cobros con tarjeta" }] }),
  component: Page,
});

const DESCRIPCION =
  "Lo que te pagaron en tus links (tarjeta, SPEI y OXXO). Los pagos con tarjeta se pueden reembolsar.";

function Page() {
  return (
    <RequiereEcartPay titulo="Cobros con tarjeta" descripcion={DESCRIPCION}>
      {() => (
        <>
          <PageHeader title="Cobros con tarjeta" description={DESCRIPCION} />
          <CobrosEcartPayCard />
        </>
      )}
    </RequiereEcartPay>
  );
}
