import { Calendar, Clock } from "lucide-react";
import { Badge, BtnPrimary, Card } from "@/components/portal-shell";
import { tonoProximoPago } from "../estados";
import type { Item } from "../types";
import { daysUntil, preview } from "../utils";
import { VerTodos } from "./comunes";

export function ProximosPagos({
  prox,
  all,
  onToggleAll,
  onPagar,
}: {
  prox: Item[];
  all: boolean;
  onToggleAll: () => void;
  onPagar: (s: Item) => void;
}) {
  return (
    <Card className="mb-6">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Calendar size={14} className="text-muted-foreground" />
        Proximos pagos y vencimientos
      </h3>
      <div className="divide-y">
        {preview(prox, all).map((s) => {
          const Icon = s.icon;
          const dd = daysUntil(s.venc);
          const isVencido = dd < 0;
          return (
            <div key={s.n + s.c} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-md bg-[color:var(--brand-primary-50)] flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-[color:var(--brand-primary-700)]" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{s.n}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.c} · {s.cat}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-sm font-semibold">{s.v}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end">
                    <Clock size={10} />
                    {isVencido ? `Vencido hace ${Math.abs(dd)} dias` : `Vence en ${dd} dias`}
                  </div>
                </div>
                <Badge tone={tonoProximoPago(isVencido, s.e)}>{isVencido ? "Vencido" : s.e}</Badge>
                <BtnPrimary className="h-9 px-4" onClick={() => onPagar(s)}>
                  Pagar
                </BtnPrimary>
              </div>
            </div>
          );
        })}
      </div>
      <VerTodos total={prox.length} all={all} onToggle={onToggleAll} />
    </Card>
  );
}
