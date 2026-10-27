import type { DashboardKPI } from "@/lib/api/cobros-masivos";
import { formatMoney } from "@/shared/format";

function Kpi({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`font-display tabular-nums text-sm md:text-base font-semibold mt-0.5${color ? ` ${color}` : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Fila de 7 KPIs del dashboard de cobros masivos. */
export function DashboardKpis({ kpi }: { kpi: DashboardKPI }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
      <Kpi label="Total de lotes" value={kpi.totalLotes} />
      <Kpi label="En proceso" value={kpi.enProceso} color="text-amber-600" />
      <Kpi label="Finalizados" value={kpi.finalizados} color="text-emerald-600" />
      <Kpi label="Con error" value={kpi.conError} color="text-danger-600" />
      <Kpi label="Monto total" value={formatMoney(kpi.montoTotal)} />
      <Kpi label="Cobrado" value={formatMoney(kpi.montoCobrado)} color="text-emerald-600" />
      <Kpi label="Pendiente" value={formatMoney(kpi.montoPendiente)} color="text-amber-600" />
    </div>
  );
}
