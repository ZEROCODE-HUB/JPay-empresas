import { useState } from "react";
import { Banknote, CreditCard, Landmark, Loader2, Lock } from "lucide-react";
import { BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { TOPE_OXXO, type MetodoCheckout } from "@/lib/api/checkout-ecartpay";
import { formatMoney } from "@/shared/format";
import { useIniciarPagoEcartPay } from "../hooks/useCheckoutEcartPay";
import { parseMonto } from "../utils";

const METODOS: { id: MetodoCheckout; label: string; detalle: string; icon: typeof CreditCard }[] = [
  {
    id: "tarjeta",
    label: "Tarjeta",
    detalle: "Pagás en la página segura de Ecart Pay y volvés acá al terminar.",
    icon: CreditCard,
  },
  {
    id: "spei",
    label: "Transferencia SPEI",
    detalle: "Te damos una CLABE única para transferir desde tu banco.",
    icon: Landmark,
  },
  {
    id: "oxxo",
    label: "Efectivo en OXXO",
    detalle: `Te damos una referencia para pagar en efectivo en OXXO (hasta ${formatMoney(TOPE_OXXO)}).`,
    icon: Banknote,
  },
];

/**
 * Columna de pago cuando el comercio cobra con Ecart Pay. Tarjeta (con 3D Secure y meses sin
 * intereses) se completa en la página de Ecart Pay; SPEI y OXXO entregan una referencia.
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
  const [metodo, setMetodo] = useState<MetodoCheckout>("tarjeta");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const monto = parseMonto(montoPagar);
  const actual = METODOS.find((m) => m.id === metodo) ?? METODOS[0];

  const pagar = () => {
    if (!nombre.trim()) return setError("Ingresá tu nombre.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setError("Ingresá un email válido.");
    if (!(monto > 0) || monto > total) return setError("El monto no es válido.");
    if (metodo === "oxxo" && monto > TOPE_OXXO) {
      return setError(`En OXXO se puede pagar hasta ${formatMoney(TOPE_OXXO)}.`);
    }
    setError(null);
    iniciar.mutate(
      { metodo, monto, nombre: nombre.trim(), email: email.trim() },
      { onError: (e) => setError((e as Error).message) },
    );
  };

  return (
    <Card className="shadow-xl border-0">
      <Label>Medio de pago</Label>
      <div className="grid grid-cols-3 gap-2 mt-1.5">
        {METODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMetodo(m.id)}
            className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-xs font-semibold text-center transition ${
              metodo === m.id
                ? "border-[color:var(--brand-primary-700)] bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)]"
                : "bg-card hover:bg-muted"
            }`}
          >
            <m.icon size={16} /> {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">{actual.detalle}</p>

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
            <Loader2 size={16} className="animate-spin" />
            {metodo === "tarjeta" ? "Conectando con Ecart Pay…" : "Generando referencia…"}
          </>
        ) : (
          <>
            <Lock size={15} />
            {metodo === "tarjeta" ? "Pagar" : "Generar referencia"}{" "}
            {monto > 0 ? formatMoney(monto) : ""}
          </>
        )}
      </BtnPrimary>
    </Card>
  );
}
