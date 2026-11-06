import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/app/enviar` (acceso de la barra inferior en móvil): abre Transferencias SPEI. */
export const Route = createFileRoute("/app/enviar/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/enviar/spei", replace: true });
  },
});
