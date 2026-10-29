import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { CheckoutEstado } from "@/features/checkout/components/CheckoutEstado";
import { CobreSpeiPagoCard } from "@/features/checkout/components/CobreSpeiPagoCard";
import { EcartPayPagoCard } from "@/features/checkout/components/EcartPayPagoCard";
import { EcartPayResultado } from "@/features/checkout/components/EcartPayResultado";
import { PagoCard } from "@/features/checkout/components/PagoCard";
import { PagoExitoso } from "@/features/checkout/components/PagoExitoso";
import { ResumenCobro } from "@/features/checkout/components/ResumenCobro";
import { useCobreDisponible } from "@/features/checkout/hooks/useCheckoutCobre";
import { useEcartPayDisponible } from "@/features/checkout/hooks/useCheckoutEcartPay";
import { useCheckoutPago } from "@/features/checkout/hooks/useCheckoutPago";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/p/$code")({
  // ?pago=<id>: vuelta desde Ecart Pay.
  validateSearch: (s: Record<string, unknown>): { pago?: string } => ({
    pago: typeof s.pago === "string" && UUID.test(s.pago) ? s.pago : undefined,
  }),
  component: Checkout,
});

function Checkout() {
  const { code } = Route.useParams();
  const { pago: pagoId } = Route.useSearch();
  const navigate = useNavigate();
  const pago = useCheckoutPago(code);
  const ecart = useEcartPayDisponible(code);
  const { status, data, result } = pago;
  const cobre = useCobreDisponible(code);
  const conEcartPay = ecart.data?.disponible === true;
  const conCobre = cobre.data?.disponible === true;

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
          {pagoId ? (
            <EcartPayResultado
              pagoId={pagoId}
              data={data}
              onReintentar={() => void navigate({ to: "/p/$code", params: { code }, search: {} })}
            />
          ) : (
            <>
              {/* Mientras se consulta si el comercio cobra con Ecart Pay, sigue "cargando". */}
              <CheckoutEstado
                status={
                  status === "ready" && (ecart.isLoading || cobre.isLoading) ? "loading" : status
                }
              />

              {status === "success" && result && <PagoExitoso result={result} data={data} />}

              {status === "ready" && data && !ecart.isLoading && !cobre.isLoading && (
                <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 items-start">
                  {/* Resumen del cobro */}
                  <ResumenCobro
                    data={data}
                    montoPagar={pago.montoPagar}
                    onMontoPagar={pago.setMontoPagar}
                    total={pago.total}
                  />
                  {/* Pago: Ecart Pay si el comercio lo tiene conectado y/o SPEI con Cobre (conviven
                      mientras se decide; ver docs/COMPARATIVA_SPEI_ECARTPAY_COBRE.md). */}
                  {conEcartPay || conCobre ? (
                    <div className="space-y-4">
                      {conEcartPay && (
                        <EcartPayPagoCard
                          code={code}
                          montoPagar={pago.montoPagar}
                          total={pago.total}
                        />
                      )}
                      {conCobre && (
                        <CobreSpeiPagoCard
                          code={code}
                          montoPagar={pago.montoPagar}
                          total={pago.total}
                        />
                      )}
                    </div>
                  ) : (
                    <PagoCard pago={pago} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
