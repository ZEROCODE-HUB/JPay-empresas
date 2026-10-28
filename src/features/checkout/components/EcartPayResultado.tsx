import { useState } from "react";
import { Check, CheckCircle2, Clock, Copy, Loader2, XCircle } from "lucide-react";
import type { CheckoutLink } from "@/lib/api/checkout";
import { esEstadoAbierto, type PagoEcart } from "@/lib/api/checkout-ecartpay";
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
  if (abierto && pago.referencia) return <InstruccionesPago pago={pago} data={data} />;
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

/** Cómo pagar con la referencia (CLABE única de SPEI o referencia de OXXO). */
function InstruccionesPago({ pago, data }: { pago: PagoEcart; data: CheckoutLink | null }) {
  const oxxo = pago.metodo === "oxxo";
  const [copiado, setCopiado] = useState(false);
  const copiar = () =>
    void navigator.clipboard?.writeText(pago.referencia ?? "").then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  return (
    <CenterCard>
      <Clock className="text-amber-600" size={30} />
      <p className="font-bold text-lg mt-1">
        {oxxo ? "Pagá en efectivo en OXXO" : "Transferí por SPEI para completar el pago"}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        {oxxo
          ? "Mostrá la referencia o el código de barras en caja. El pago es solo en efectivo."
          : "Transferí el monto exacto a esta CLABE desde tu banco. Es única para este pago."}
      </p>
      <div className="text-2xl font-black tracking-tight text-[color:var(--brand-primary-700)] mt-3">
        {formatMoney(pago.monto)}
      </div>
      <div className="w-full mt-4 rounded-lg border bg-muted/30 p-3">
        <p className="text-[11px] font-semibold text-muted-foreground">
          {oxxo ? "Referencia OXXO" : "CLABE"}
        </p>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="font-mono text-lg font-bold tracking-wider break-all">
            {pago.referencia}
          </span>
          <button
            type="button"
            onClick={copiar}
            aria-label="Copiar"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
          >
            {copiado ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        {oxxo && pago.referencia_url && (
          <img
            src={pago.referencia_url}
            alt={`Código de barras de la referencia ${pago.referencia}`}
            className="mx-auto mt-3 max-h-20"
          />
        )}
      </div>
      <div className="w-full mt-4 space-y-1.5 text-left text-sm">
        {data?.comercio_nombre && <Row label="Comercio" value={data.comercio_nombre} />}
        {!oxxo && <Row label="Banco" value="STP" />}
        {pago.referencia_vence_at && (
          <Row label="Vence" value={formatDateTime(pago.referencia_vence_at)} />
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Esta pantalla se actualiza sola cuando recibamos el pago.
      </p>
    </CenterCard>
  );
}
