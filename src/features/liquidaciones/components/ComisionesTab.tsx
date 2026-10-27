import { Badge } from "@/components/portal-shell";
import type { ComisionBandera } from "@/lib/api/liquidaciones";
import { tonoEstadoComision } from "../estados";
import { TablaLiquidaciones } from "./tabla";

const COLS = [
  { label: "Bandera" },
  { label: "Cuotas", align: "right" },
  { label: "Tasa mensual (TEM)", align: "right" },
  { label: "Estado", align: "center" },
] as const;

/** Comisiones vigentes por bandera y cuota (solo lectura). */
export function ComisionesTab({ comisiones }: { comisiones: ComisionBandera[] }) {
  return (
    <div>
      <div className="px-5 py-3 border-b">
        <div className="text-xs text-muted-foreground">
          Comisiones vigentes por bandera y cuota. Solo lectura — tasas configuradas por el
          administrador.
        </div>
      </div>
      <TablaLiquidaciones
        cols={[...COLS]}
        vacio={
          comisiones.length === 0
            ? "No hay comisiones configuradas para tu comercio. El administrador debe asignar banderas y cuotas primero."
            : null
        }
      >
        {comisiones.map((c, idx) => (
          <tr key={`${c.bandera}-${c.cuotas}-${idx}`} className="hover:bg-muted/30">
            <td className="px-5 py-3">
              <Badge tone="neutral">{c.bandera}</Badge>
            </td>
            <td className="px-5 py-3 text-right font-mono tabular-nums">{c.cuotas}x</td>
            <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold">
              {c.tasaMensual}%
            </td>
            <td className="px-5 py-3 text-center">
              <Badge tone={tonoEstadoComision(c.estado)}>{c.estado}</Badge>
            </td>
          </tr>
        ))}
      </TablaLiquidaciones>
      <div className="px-5 py-3 border-t text-[11px] text-muted-foreground">
        La tasa mensual (TEM) es el porcentaje que se aplica mensualmente sobre el monto de cada
        cuota. No se muestra la tasa anual (TNA).
      </div>
    </div>
  );
}
