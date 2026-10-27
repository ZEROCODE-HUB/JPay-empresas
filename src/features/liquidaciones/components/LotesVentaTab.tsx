import { Badge } from "@/components/portal-shell";
import type { LoteVenta } from "@/lib/api/liquidaciones";
import { formatDate, formatMoney } from "@/shared/format";
import type { Paginacion } from "../hooks/usePaginacion";
import { PaginacionTabla } from "./PaginacionTabla";
import { TablaLiquidaciones } from "./tabla";

const COLS = [
  { label: "Fecha" },
  { label: "Bandera" },
  { label: "Ops", align: "right" },
  { label: "Monto operaciones", align: "right" },
  { label: "Comisión", align: "right" },
  { label: "Impuesto", align: "right" },
  { label: "Monto cobrado", align: "right" },
] as const;

/** Importe de la vista, o "—" si la vista no lo trae. */
const monto = (v: number | null) => (v == null ? "—" : formatMoney(v));

export function LotesVentaTab({ pag }: { pag: Paginacion<LoteVenta> }) {
  return (
    <div>
      <div className="px-5 py-3 border-b">
        <div className="text-xs text-muted-foreground">
          Ventas del comercio por fecha y bandera. Datos de la vista{" "}
          <code className="bg-muted px-1 rounded">v_lotes_venta</code>.
        </div>
      </div>
      <TablaLiquidaciones
        cols={[...COLS]}
        vacio={pag.total === 0 ? "No se encontraron lotes de venta." : null}
      >
        {pag.rows.map((v, idx) => (
          <tr key={`${v.fecha}-${v.bandera}-${idx}`} className="hover:bg-muted/30">
            <td className="px-5 py-3 text-xs">{formatDate(v.fecha)}</td>
            <td className="px-5 py-3">
              <Badge tone="neutral">{v.bandera}</Badge>
            </td>
            <td className="px-5 py-3 text-right font-mono tabular-nums">{v.cantidadOperaciones}</td>
            <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold">
              {monto(v.montoOperaciones)}
            </td>
            <td className="px-5 py-3 text-right font-mono tabular-nums text-muted-foreground">
              {monto(v.comision)}
            </td>
            <td className="px-5 py-3 text-right font-mono tabular-nums text-muted-foreground">
              {monto(v.impuesto)}
            </td>
            <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
              {monto(v.montoCobrado)}
            </td>
          </tr>
        ))}
      </TablaLiquidaciones>
      <PaginacionTabla p={pag} />
    </div>
  );
}
