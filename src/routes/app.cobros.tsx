import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";

export const Route = createFileRoute("/app/cobros")({
  component: Layout,
});

function Layout() {
  return (
    <>
      <PageHeader
        title="Cobros Masivos"
        description="Automatiza la generación de cobros recurrentes con un link de pago para cada deudor."
      />
      <Outlet />
    </>
  );
}
