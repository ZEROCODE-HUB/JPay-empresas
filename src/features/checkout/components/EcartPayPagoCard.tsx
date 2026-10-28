import { useState } from "react";
import { CreditCard, Loader2, Lock } from "lucide-react";
import { BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import { useIniciarPagoEcartPay } from "../hooks/useCheckoutEcartPay";
import { parseMonto } from "../utils";

/**
 * Columna de pago cuando el comercio cobra con Ecart Pay: se piden nombre y email y el pago
 * (tarjeta, 3D Secure, meses sin intereses) se completa en la página segura de Ecart Pay.
 */
export function EcartPayPagoCard({
  code,
  montoPagar,
  total,
}: {
  code: string;
  montoPagar: string;
  total: number;
}) {
  const iniciar = useIniciarPagoEcartPay(code);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const monto = parseMonto(montoPagar);

  const pagar = () => {
    if (!nombre.trim()) return setError("Ingresá tu nombre.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setError("Ingresá un email válido.");
    if (!(monto > 0) || monto > total) return setError("El monto no es válido.");
    setError(null);
    iniciar.mutate(
      { monto, nombre: nombre.trim(), email: email.trim() },
      { onError: (e) => setError((e as Error).message) },
    );
  };

  return (
    <Card className="shadow-xl border-0">
      <div className="flex items-center gap-2 text-sm font-bold">
        <CreditCard size={17} className="text-[color:var(--brand-primary-700)]" />
        Tarjeta de crédito o débito
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Vas a completar el pago en la página segura de Ecart Pay y volver acá al terminar.
      </p>

      <div className="mt-5">
        <Label htmlFor="ep-nombre">Nombre y apellido</Label>
        <Input
          id="ep-nombre"
          className="mt-1"
          autoComplete="name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>
      <div className="mt-4">
        <Label htmlFor="ep-email">Email para el comprobante</Label>
        <Input
          id="ep-email"
          className="mt-1"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {error && <p className="mt-3 text-xs font-semibold text-danger-600">{error}</p>}

      <BtnPrimary className="mt-6 w-full" onClick={pagar} disabled={iniciar.isPending}>
        {iniciar.isPending ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Conectando con Ecart Pay…
          </>
        ) : (
          <>
            <Lock size={15} /> Pagar {monto > 0 ? formatMoney(monto) : ""}
          </>
        )}
      </BtnPrimary>
    </Card>
  );
}
