import { Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import type { TotalesHistorial } from "../utils";

/** KPIs de la página actual: ingresos, egresos, neto y pendientes/rechazados. */
export function HistorialKpis({ totales: t }: { totales: TotalesHistorial }) {
  const neto = t.totalIngresos - t.totalEgresos;
  return (
    <div className="grid md:grid-cols-4 gap-5 mb-6">
      <Card className="p-5">
        <div className="text-xs text-muted-foreground mb-1">Ingresos del periodo</div>
        <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-emerald-700">
          {formatMoney(t.totalIngresos)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{t.lineasIngreso} líneas</div>
      </Card>
      <Card className="p-5">
        <div className="text-xs text-muted-foreground mb-1">Egresos del periodo</div>
        <div className="text-xl md:text-2xl font-bold text-foreground">
          {formatMoney(t.totalEgresos)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {t.lineasEgreso} líneas (incluye comisiones e impuestos)
        </div>
      </Card>
      <Card className="p-5">
        <div className="text-xs text-muted-foreground mb-1">Neto</div>
        <div
          className={`font-display tabular-nums text-xl md:text-2xl font-bold ${neto >= 0 ? "text-emerald-700" : "text-danger-600"}`}
        >
          {neto >= 0 ? "+ " : "- "}
          {formatMoney(Math.abs(neto))}
        </div>
      </Card>
      <Card className="p-5">
        <div className="text-xs text-muted-foreground mb-1">Pendientes / Rechazados</div>
        <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-foreground">
          {t.totalPendientes}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {t.txPendientes} pendientes, {t.txRechazadas} rechazadas
        </div>
      </Card>
    </div>
  );
}
