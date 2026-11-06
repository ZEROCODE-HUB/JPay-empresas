import { createFileRoute, redirect } from "@tanstack/react-router";

/** URL vieja: el cobro por SPEI ahora está en Cobrar › Cobros por SPEI. */
export const Route = createFileRoute("/app/(viejas)/cobrar-spei")({
  beforeLoad: () => {
    throw redirect({ to: "/app/cobrar/spei", replace: true });
  },
});
