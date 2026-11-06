import { createFileRoute } from "@tanstack/react-router";
import { LinksPagoResumen } from "@/features/link-pago/dashboard/LinksPagoResumen";

export const Route = createFileRoute("/app/cobrar/links/dashboard")({
  component: LinksPagoResumen,
});
