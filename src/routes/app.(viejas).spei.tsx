import { createFileRoute, redirect } from "@tanstack/react-router";

/** URL vieja: las transferencias SPEI ahora están en Enviar › Transferencias SPEI. */
export const Route = createFileRoute("/app/(viejas)/spei")({
  beforeLoad: () => {
    throw redirect({ to: "/app/enviar/spei", replace: true });
  },
});
