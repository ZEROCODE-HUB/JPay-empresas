import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { CheckoutLink } from "@/lib/api/checkout";
import { esEstadoAbierto } from "@/lib/api/checkout-ecartpay";
import { formatDateTime, formatMoney } from "@/shared/format";
import { useConfirmarPagoEcartPay } from "../hooks/useCheckoutEcartPay";
import { CenterCard, Row } from "./CenterCard";

/** Pantalla al volver de Ecart Pay: el estado lo confirma el servidor consultando la orden. */
export function EcartPayResultado({
  pagoId,
  data,
  onReintentar,
}: {
  pagoId: string;
  data: CheckoutLink | null;
  onReintentar: () => void;
}) {
  const { data: pago, isLoading, error } = useConfirmarPagoEcartPay(pagoId);

  if (isLoading) {
    return (
      <CenterCard>
        <Loader2 className="animate-spin text-muted-foreground" size={28} />
        <p className="font-semibold mt-3">Confirmando tu pago…</p>
      </CenterCard>
    );
  }
  if (error || !pago) {
    return (
      <CenterCard>
        <XCircle className="text-danger-600" size={32} />
        <p className="font-bold text-lg mt-2">No pudimos confirmar el pago</p>
        <p className="text-sm text-muted-foreground mt-1">
          {(error as Error | null)?.message ?? "Intentá de nuevo en unos minutos."}
        </p>
      </CenterCard>
    );
  }

  const pagado = pago.estado === "pagado";
  const abierto = esEstadoAbierto(pago.estado);
  return (
    <CenterCard>
      {pagado ? (
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
          <CheckCircle2 className="text-emerald-600" size={32} />
        </div>
      ) : abierto ? (
        <Clock className="text-amber-600" size={32} />
      ) : (
        <XCircle className="text-danger-600" size={32} />
      )}
      <p className="font-bold text-lg mt-1">
        {pagado ? "Pago aprobado" : abierto ? "Pago en proceso" : "El pago no se completó"}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        {pagado
          ? "Gracias, tu operación fue completada."
          : abierto
            ? "Todavía no recibimos la confirmación. Esta pantalla se actualiza sola."
            : (pago.motivo ?? "La operación fue rechazada o cancelada.")}
      </p>
      <div className="text-2xl font-black tracking-tight text-[color:var(--brand-primary-700)] mt-3">
        {formatMoney(pago.monto)}
      </div>
      <div className="w-full mt-4 space-y-1.5 text-left text-sm">
        {data?.comercio_nombre && <Row label="Comercio" value={data.comercio_nombre} />}
        {pago.orden_id && <Row label="Orden" value={pago.orden_id} />}
        {pago.pagado_at && <Row label="Fecha" value={formatDateTime(pago.pagado_at)} />}
      </div>
      {!pagado && !abierto && (
        <button
          type="button"
          onClick={onReintentar}
          className="mt-5 text-sm font-semibold text-[color:var(--brand-primary-700)] hover:underline"
        >
          Intentar de nuevo
        </button>
      )}
    </CenterCard>
  );
}
