import { ShieldCheck } from "lucide-react";
import { brand } from "@/brand/brand";
import { Card, Input, Label } from "@/components/portal-shell";
import type { CheckoutLink } from "@/lib/api/checkout";
import { formatMoney } from "@/shared/format";
import { parseMonto } from "../utils";

/** Columna izquierda del checkout: comercio, total, detalle y monto parcial. */
export function ResumenCobro({
  data,
  montoPagar,
  onMontoPagar,
  total,
}: {
  data: CheckoutLink;
  montoPagar: string;
  onMontoPagar: (v: string) => void;
  total: number;
}) {
  return (
    <Card className="p-6 shadow-xl border-0">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground mb-1">
        <ShieldCheck size={14} className="text-emerald-600" /> {data.comercio_nombre || brand.name}
      </div>
      <div className="text-3xl font-black tracking-tight text-[color:var(--brand-primary-700)]">
        {formatMoney(parseMonto(montoPagar) || 0)}
      </div>
      <div className="text-xs text-muted-foreground">Total a abonar</div>

      {data.detalle?.length > 0 && (
        <div className="mt-4 border rounded-lg divide-y">
          {data.detalle.map((p, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.producto_nombre}</div>
                <div className="text-[11px] text-muted-foreground">
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

      {data.referencia && (
        <div className="mt-4 text-xs text-muted-foreground">
          Referencia: <span className="font-semibold text-foreground">{data.referencia}</span>
        </div>
      )}
      {data.notas && <div className="mt-2 text-xs text-muted-foreground">{data.notas}</div>}

      {data.pagos_parciales && (
        <div className="mt-4">
          <Label>Monto a pagar (pagos parciales habilitados)</Label>
          <Input
            className="mt-1"
            inputMode="decimal"
            value={montoPagar}
            onChange={(e) => onMontoPagar(e.target.value)}
          />
          <div className="text-[11px] text-muted-foreground mt-1">Máximo {formatMoney(total)}</div>
        </div>
      )}
    </Card>
  );
}
