import { useState } from "react";
import { CheckCircle2, Copy, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { formatDateTime, formatMoney } from "@/shared/format";
import { validarCurp, validarRfc } from "@/shared/validadores";
import { useEstadoPagoCobre, useIniciarPagoCobre } from "../hooks/useCheckoutCobre";
import { parseMonto } from "../utils";

/**
 * Pago por transferencia SPEI con Cobre: se genera una CLABE de un solo uso por el monto, con
 * vencimiento. Convive con Ecart Pay mientras se decide qué SPEI queda
 * (docs/COMPARATIVA_SPEI_ECARTPAY_COBRE.md).
 */
export function CobreSpeiPagoCard({
  code,
  montoPagar,
  total,
}: {
  code: string;
  montoPagar: string;
  total: number;
}) {
  const iniciar = useIniciarPagoCobre(code);
  const [nombre, setNombre] = useState("");
  const [idNumero, setIdNumero] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pago = useEstadoPagoCobre(iniciar.data?.pago_id);
  const monto = parseMonto(montoPagar);
  const datos = pago.data ?? iniciar.data;

  const generar = () => {
    const id = idNumero.trim().toUpperCase();
    if (!nombre.trim()) return setError("Ingresá tu nombre o razón social.");
    const err = id.length === 18 ? validarCurp(id) : validarRfc(id);
    if (err) return setError(`RFC o CURP: ${err}`);
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setError("Ingresá un email válido.");
    if (!(monto > 0) || monto > total) return setError("El monto no es válido.");
    setError(null);
    iniciar.mutate(
      { monto, nombre: nombre.trim(), idNumero: id, email: email.trim() },
      { onError: (e) => setError((e as Error).message) },
    );
  };

  if (datos?.estado === "pagado") {
    return (
      <Card className="text-center">
        <CheckCircle2 className="mx-auto text-success" size={40} />
        <h2 className="mt-2 font-semibold">¡Pago recibido!</h2>
        <p className="text-sm text-muted-foreground">
          Recibimos tu transferencia de {formatMoney(datos.monto)}.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Landmark size={18} />
        <h2 className="font-semibold">Pagar con transferencia SPEI</h2>
      </div>
      {datos?.clabe ? (
        <div className="mt-4 space-y-2 text-sm">
          <p>
            Transferí desde tu banco exactamente{" "}
            <span className="font-semibold">{formatMoney(datos.monto)}</span> a esta CLABE:
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-2 font-mono text-lg hover:text-secondary"
            onClick={() =>
              navigator.clipboard.writeText(datos.clabe!).then(
                () => toast.success("CLABE copiada"),
                () => toast.error("No se pudo copiar"),
              )
            }
          >
            {datos.clabe} <Copy size={16} />
          </button>
          {datos.vence_at && (
            <p className="text-xs text-muted-foreground">
              Vence {formatDateTime(datos.vence_at)}. Sirve para un solo pago.
            </p>
          )}
          {["cancelado", "rechazado", "error"].includes(datos.estado) ? (
            <p className="text-sm text-danger-600">
              La CLABE ya no está vigente. Generá una nueva.
            </p>
          ) : (
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={13} className="animate-spin" /> Esperando tu transferencia…
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="cobre-nombre">Nombre o razón social</Label>
            <Input
              id="cobre-nombre"
              className="mt-1"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cobre-id">RFC o CURP</Label>
            <Input
              id="cobre-id"
              className="mt-1"
              value={idNumero}
              onChange={(e) => setIdNumero(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cobre-email">Email (opcional)</Label>
            <Input
              id="cobre-email"
              className="mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {datos?.aviso && <p className="text-xs text-muted-foreground">{datos.aviso}</p>}
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <BtnPrimary onClick={generar} disabled={iniciar.isPending} className="w-full">
            {iniciar.isPending ? "Generando…" : `Obtener CLABE para pagar ${formatMoney(monto)}`}
          </BtnPrimary>
        </div>
      )}
    </Card>
  );
}
