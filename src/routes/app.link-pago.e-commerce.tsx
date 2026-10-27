import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { CapacidadesCard } from "@/features/link-pago/e-commerce/components/CapacidadesCard";
import { ClaveIntegracionModal } from "@/features/link-pago/e-commerce/components/ClaveIntegracionModal";
import { IntegracionesTabla } from "@/features/link-pago/e-commerce/components/IntegracionesTabla";
import { useIntegracionesEcom } from "@/features/link-pago/e-commerce/hooks/useIntegracionesEcom";

export const Route = createFileRoute("/app/link-pago/e-commerce")({ component: Page });

function Page() {
  const s = useIntegracionesEcom();
  return (
    <>
      <PageHeader
        title="E-commerce"
        description="Gestiona las integraciones de pago para tu tienda online."
      />
      <CapacidadesCard />
      <IntegracionesTabla s={s} />
      <ClaveIntegracionModal s={s} />
    </>
  );
}
