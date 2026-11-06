import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { SeccionTabs } from "@/shared/ui/seccion-tabs";

export const Route = createFileRoute("/app/cobros")({
  head: () => ({ meta: [{ title: "Cobros masivos" }] }),
  component: Layout,
});

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "gestion", label: "Gestión de lotes" },
] as const;

function Layout() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const tab = path.replace(/\/$/, "") === "/app/cobros" ? "resumen" : "gestion";
  return (
    <>
      <PageHeader
        title="Cobros masivos"
        description="Automatiza la generación de cobros recurrentes con un link de pago para cada deudor."
      />
      <SeccionTabs
        tabs={TABS}
        value={tab}
        onChange={(t) => navigate({ to: t === "resumen" ? "/app/cobros" : "/app/cobros/gestion" })}
      />
      <Outlet />
    </>
  );
}
