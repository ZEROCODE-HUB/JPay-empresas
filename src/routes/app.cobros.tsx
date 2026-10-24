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
        description="Automatiza la generacion de cobros recurrentes: links de pago, codigos QR y CBU para cada deudor."
      />
      <Outlet />
    </>
  );
}