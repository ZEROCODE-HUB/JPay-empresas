import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/app/cobrar` (acceso de la barra inferior en móvil): abre Links de pago. */
export const Route = createFileRoute("/app/cobrar/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/cobrar/links/dashboard", replace: true });
  },
});
