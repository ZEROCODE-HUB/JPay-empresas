import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { CheckoutEstado } from "@/features/checkout/components/CheckoutEstado";
import { PagoCard } from "@/features/checkout/components/PagoCard";
import { PagoExitoso } from "@/features/checkout/components/PagoExitoso";
import { ResumenCobro } from "@/features/checkout/components/ResumenCobro";
import { useCheckoutPago } from "@/features/checkout/hooks/useCheckoutPago";

export const Route = createFileRoute("/p/$code")({ component: Checkout });

function Checkout() {
  const { code } = Route.useParams();
  const pago = useCheckoutPago(code);
  const { status, data, result } = pago;

  return (
    <div className="min-h-screen bg-[radial-gradient(120%_120%_at_50%_0%,#fff_40%,var(--brand-primary-50)_100%)] flex flex-col">
      {/* Barra de marca */}
      <header className="flex items-center justify-between px-5 py-4 max-w-4xl mx-auto w-full">
        <BrandLogo />
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <Lock size={13} /> Pago seguro
        </div>
      </header>

      <main className="flex-1 px-4 pb-10">
        <div className="w-full max-w-4xl mx-auto">
          <CheckoutEstado status={status} />

          {status === "success" && result && <PagoExitoso result={result} data={data} />}

          {status === "ready" && data && (
            <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 items-start">
              {/* Resumen del cobro */}
              <ResumenCobro
                data={data}
                montoPagar={pago.montoPagar}
                onMontoPagar={pago.setMontoPagar}
                total={pago.total}
              />
              {/* Pago */}
              <PagoCard pago={pago} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
