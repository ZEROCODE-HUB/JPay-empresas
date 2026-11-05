import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { pageTitle } from "@/brand/brand";

// Página pública a la que Ecart Pay manda al suscriptor después de registrar su tarjeta.
export const Route = createFileRoute("/suscripcion/lista")({
  head: () => ({ meta: [{ title: pageTitle("Suscripción registrada") }] }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandLogo />
      <CheckCircle2 className="h-12 w-12 text-green-600" aria-hidden />
      <div className="space-y-2 max-w-md">
        <h1 className="text-xl font-semibold">Listo, tu suscripción quedó registrada</h1>
        <p className="text-sm text-muted-foreground">
          Los cobros se harán a la tarjeta que registraste. Si tienes dudas, escríbele al comercio
          que te envió el link. Ya puedes cerrar esta página.
        </p>
      </div>
    </div>
  );
}
