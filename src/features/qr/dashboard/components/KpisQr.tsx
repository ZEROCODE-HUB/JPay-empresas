import type { Kpi } from "../utils";

/** KPI cards */
export function KpisQr({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {kpis.map((k) => (
        <div key={k.label} className="bg-card border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <k.icon size={14} className="text-muted-foreground" />
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {k.label}
            </div>
          </div>
          <div className="font-display tabular-nums text-sm md:text-base font-semibold">
            {k.value}
          </div>
        </div>
      ))}
    </div>
  );
}
