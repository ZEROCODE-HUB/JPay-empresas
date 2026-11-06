import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { SeccionTabs } from "@/shared/ui/seccion-tabs";

export const Route = createFileRoute("/app/cobrar/links")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/$/, "") === "/app/cobrar/links") {
      throw redirect({ to: "/app/cobrar/links/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Links de pago" }] }),
  component: Layout,
});

const TABS = [
  { id: "dashboard", label: "Resumen" },
  { id: "productos", label: "Productos y links" },
] as const;

function Layout() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const tab = path.startsWith("/app/cobrar/links/productos") ? "productos" : "dashboard";
  return (
    <>
      <PageHeader
        title="Links de pago"
        description="Crea productos, genera links de cobro para compartir con tus clientes y sigue lo que cobraste."
      />
      <SeccionTabs
        tabs={TABS}
        value={tab}
        onChange={(t) =>
          navigate({
            to: t === "productos" ? "/app/cobrar/links/productos" : "/app/cobrar/links/dashboard",
          })
        }
      />
      <Outlet />
    </>
  );
}
