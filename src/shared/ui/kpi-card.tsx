import type { ReactNode } from "react";
import { Cargando } from "./estado-carga";
import { EtiquetaConInfo } from "./info-tip";

export function KpiCard({
  label,
  value,
  sub,
  info,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  /** Mientras carga se muestra un gris animado en vez del valor (nunca $0). */
  loading?: boolean;
  /** De dónde sale el dato y cómo se calcula; se muestra con una «i» al pasar el mouse. */
  info?: ReactNode;
}) {
  return (
    <div className="bg-muted/40 border rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        <EtiquetaConInfo label={label} info={info} />
      </div>
      <div className="font-display text-lg font-semibold text-foreground mt-1 tabular-nums">
        {loading ? <Cargando className="h-6 w-24" /> : value}
      </div>
      {sub && !loading && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
