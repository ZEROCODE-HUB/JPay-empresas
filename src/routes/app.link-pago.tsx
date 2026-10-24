import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/link-pago")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/app/link-pago") {
      throw redirect({ to: "/app/link-pago/dashboard" });
    }
  },
  component: Layout,
});

function Layout() {
  return <Outlet />;
}
