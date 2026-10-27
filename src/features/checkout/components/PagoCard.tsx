import { CreditCard, FlaskConical, Loader2, Lock } from "lucide-react";
import { BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import type { CheckoutPago } from "../hooks/useCheckoutPago";
import { isCardMethod, parseMonto } from "../utils";
import { TarjetaForm } from "./TarjetaForm";

/** Columna derecha del checkout: metodo, datos de pago, email y botones. */
export function PagoCard({ pago }: { pago: CheckoutPago }) {
  const { metodosDisponibles, method, processing } = pago;

  return (
    <Card className="p-6 shadow-xl border-0">
      <div>
        <Label>Metodo de pago</Label>
        {metodosDisponibles.length === 0 ? (
          <p className="mt-1.5 rounded-lg border border-black-100 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            No hay metodos de pago habilitados para este link. Contacta al comercio.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
            {metodosDisponibles.map((m) => (
              <button
                key={m.id}
                onClick={() => pago.chooseMethod(m.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold transition ${
                  method === m.id
                    ? "border-[color:var(--brand-primary-700)] bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)]"
                    : "bg-card hover:bg-muted"
                }`}
              >
                <CreditCard size={15} /> {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {metodosDisponibles.length === 0 ? null : isCardMethod(method) ? (
        <TarjetaForm method={method} tarjeta={pago.tarjeta} formRef={pago.cardFormRef} />
      ) : (
        <div className="mt-6 rounded-lg border border-black-100 bg-[color:var(--brand-primary-50)] p-4">
          <div className="flex items-center gap-2 text-sm font-bold mb-3">
            <CreditCard size={17} className="text-[color:var(--brand-primary-700)]" />
            {method === "qr" ? "Codigo QR" : "Datos de transferencia"}
          </div>
          <p className="text-xs text-muted-foreground">
            {method === "qr"
              ? "Se generara un codigo QR para completar el pago."
              : "Se te indicaran los datos de la cuenta para transferir."}
          </p>
        </div>
      )}

      <div className="mt-4">
        <Label>Email para el comprobante</Label>
        <Input
          className="mt-1"
          type="email"
          value={pago.email}
          onChange={(e) => pago.setEmail(e.target.value)}
          placeholder="tu@email.com"
        />
      </div>

      <BtnPrimary
        className="w-full mt-6 h-12 text-sm"
        onClick={pago.pagar}
        disabled={processing || metodosDisponibles.length === 0}
      >
        {processing ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Procesando…
          </>
        ) : (
          `Pagar ${formatMoney(parseMonto(pago.montoPagar) || 0)}`
        )}
      </BtnPrimary>

      {/*
        Boton de simulacion: registra el cobro en la base como
        aprobado sin llamar a la pasarela, para probar el flujo
        completo (comprobante, movimiento, lotes) sin tarjeta ni
        sandbox de Payway. El backend lo responde con 404 en
        produccion, asi que aunque aparezca nunca simula un cobro
        contra datos reales.
      */}
      <button
        type="button"
        onClick={pago.simular}
        disabled={processing}
        className="w-full mt-3 h-11 text-sm rounded-lg border-2 border-dashed border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <Loader2 size={15} className="animate-spin" /> Simulando…
          </>
        ) : (
          <>
            <FlaskConical size={15} /> Simular pago (solo test)
          </>
        )}
      </button>

      <p className="text-[11px] text-center text-muted-foreground mt-3 flex items-center justify-center gap-1">
        <Lock size={11} /> Tus datos se transmiten cifrados
      </p>
    </Card>
  );
}
