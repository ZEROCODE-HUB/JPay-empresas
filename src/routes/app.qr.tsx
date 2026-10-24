import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/qr")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/app/qr") {
      throw redirect({ to: "/app/qr/dashboard" });
    }
  },
  component: Layout,
});

function Layout() {
  return <Outlet />;
}
