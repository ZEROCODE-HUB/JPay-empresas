import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { SolicitudDomiciliacion } from "@/features/domiciliacion/components/SolicitudDomiciliacion";

export const Route = createFileRoute("/app/domiciliacion")({
  head: () => ({ meta: [{ title: "Domiciliación" }] }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader
        title="Domiciliación"
        description="Cobra de forma recurrente o única a la cuenta de tus clientes, con su autorización."
      />
      <SolicitudDomiciliacion />
    </>
  );
}
