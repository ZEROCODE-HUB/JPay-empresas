import { CheckCircle2, ShieldCheck } from "lucide-react";
import type { CheckoutLink } from "@/lib/api/checkout";
import { formatDateTime, formatMoney } from "@/shared/format";
import type { ResultadoPago } from "../hooks/useCheckoutPago";
import { CenterCard, Row } from "./CenterCard";

/** Comprobante que ve el pagador al terminar (pago real o simulado). */
export function PagoExitoso({
  result,
  data,
}: {
  result: ResultadoPago;
  data: CheckoutLink | null;
}) {
  return (
    <CenterCard>
      <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
        <CheckCircle2 className="text-emerald-600" size={32} />
      </div>
      <p className="font-bold text-lg">{result.simulado ? "Pago simulado" : "Pago aprobado"}</p>
      <p className="text-sm text-muted-foreground mt-1">
        {result.simulado
          ? "Simulacion completada: no se realizo ningun cargo."
          : "Gracias, tu operacion fue completada."}
      </p>
      {result.simulado && (
        <div className="w-full mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800 text-left">
          Pago simulado — el cobro quedo registrado en la base como aprobado, pero no se realizo
          ningun cargo.
        </div>
      )}

      {/* El comercio y el monto van arriba y en cuerpo grande: es lo
          unico que el pagador necesita confirmar de un vistazo. */}
      {data?.comercio_nombre && (
        <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-muted-foreground mt-3">
          <ShieldCheck size={14} className="text-emerald-600" /> {data.comercio_nombre}
        </div>
      )}
      <div className="text-2xl font-black tracking-tight text-[color:var(--brand-primary-700)] mt-1">
        {formatMoney(result.monto)}
      </div>

      {/* Detalle de lo que se pago. Es el mismo listado que se ve antes
          de confirmar, para que el pagador pueda contrastar contra su
          comprobante sin volver atras. */}
      {data?.detalle && data.detalle.length > 0 && (
        <div className="w-full mt-4 border rounded-lg divide-y text-left">
          {data.detalle.map((p, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.producto_nombre}</div>
                <div className="text-muted-foreground">
                  {p.cantidad} × {formatMoney(p.precio_unitario)}
                </div>
              </div>
              <div className="font-mono tabular-nums font-semibold">
                {formatMoney(p.precio_unitario * p.cantidad)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="w-full mt-4 space-y-2 text-sm">
        <Row label="Fecha y hora" value={formatDateTime(result.pagoEn)} />
        {result.metodo && (
          <Row
            label="Metodo de pago"
            value={result.cuotas ? `${result.metodo} - ${result.cuotas} cuota` : result.metodo}
          />
        )}
        <Row label="Referencia" value={result.ref || "—"} />
        <Row label="Comprobante" value={String(result.id).slice(0, 8).toUpperCase()} />
        {/* Codigo de operacion de la pasarela. Es el dato que hay que
            dar si el cobro hay que reclamarlo. */}
        {result.paywayPaymentId && (
          <Row label="Codigo de operacion" value={result.paywayPaymentId} />
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-4 text-left">
        Guardá el comprobante y el codigo de operacion. Con esos dos datos se puede rastrear el
        pago.
      </p>
    </CenterCard>
  );
}
