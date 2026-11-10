import type { ReactNode } from "react";
import { EtiquetaConInfo } from "./info-tip";

export function KpiCard({
  label,
  value,
  sub,
  info,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  /** De dónde sale el dato y cómo se calcula; se muestra con una «i» al pasar el mouse. */
  info?: ReactNode;
}) {
  return (
    <div className="bg-muted/40 border rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        <EtiquetaConInfo label={label} info={info} />
      </div>
      <div className="font-display text-lg font-semibold text-foreground mt-1 tabular-nums">
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
