import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * URLs viejas de Link de pago (`/app/link-pago/*`): los links ahora están en Cobrar › Links de
 * pago (`/app/cobrar/links/*`) y la integración con e-commerce en APIs y e-commerce.
 */
export const Route = createFileRoute("/app/link-pago")({
  beforeLoad: ({ location }) => {
    const resto = location.pathname.replace(/^\/app\/link-pago\/?/, "").replace(/\/$/, "");
    if (resto === "e-commerce") throw redirect({ to: "/app/api-config", replace: true });
    if (resto === "productos") throw redirect({ to: "/app/cobrar/links/productos", replace: true });
    throw redirect({ to: "/app/cobrar/links/dashboard", replace: true });
  },
});
