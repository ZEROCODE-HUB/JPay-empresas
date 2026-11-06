import { createFileRoute } from "@tanstack/react-router";

/** Cualquier sub-ruta vieja de `/app/link-pago`: la redirige el layout (`app.link-pago.tsx`). */
export const Route = createFileRoute("/app/link-pago/$")({});
