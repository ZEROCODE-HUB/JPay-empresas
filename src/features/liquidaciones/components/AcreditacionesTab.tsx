import { Badge } from "@/components/portal-shell";
import type { LoteAcredDetalle } from "@/lib/api/liquidaciones";
import { formatDate, formatMoney } from "@/shared/format";
import type { Paginacion } from "../hooks/usePaginacion";
import { sumaImporteNeto } from "../utils";
import { PaginacionTabla } from "./PaginacionTabla";
import { TablaLiquidaciones } from "./tabla";

const COLS = [
  { label: "Lote" },
  { label: "Bandera" },
  { label: "Operaciones", align: "right" },
  { label: "Importe neto", align: "right" },
  { label: "Fecha estimada" },
  { label: "Cobro real" },
  { label: "Acreditado el" },
  { label: "Estado", align: "center" },
] as const;

/** Historial de lotes ya acreditados (`pag` ya viene ordenado, el más reciente primero). */
export function AcreditacionesTab({
  lotes,
  pag,
}: {
  lotes: LoteAcredDetalle[];
  pag: Paginacion<LoteAcredDetalle>;
}) {
  return (
    <div>
      <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Lotes que ya fueron acreditados a tu subcuenta Operativa (estado{" "}
          <Badge tone="success">Acreditado</Badge>). Suma:{" "}
          <span className="font-mono font-semibold text-emerald-700">
            {formatMoney(sumaImporteNeto(lotes))}
          </span>
        </div>
      </div>
      <TablaLiquidaciones
        cols={[...COLS]}
        vacio={pag.total === 0 ? "Aún no tenés acreditaciones registradas." : null}
      >
        {pag.rows.map((l) => (
          <tr key={l.fullId ?? l.id} className="hover:bg-muted/30">
            <td className="px-5 py-3 font-mono font-semibold">{l.id}</td>
            <td className="px-5 py-3">
              <Badge tone="neutral">{l.bandera}</Badge>
            </td>
            <td className="px-5 py-3 text-right font-mono tabular-nums">{l.cantidadOperaciones}</td>
            <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
              {formatMoney(l.importeNeto)}
            </td>
            <td className="px-5 py-3 text-xs">{formatDate(l.fecha)}</td>
            <td className="px-5 py-3 text-xs">
              {l.fechaCobroReal ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono">{formatDate(l.fechaCobroReal)}</span>
                  <Badge tone="success">real</Badge>
                </div>
              ) : (
                <Badge tone="neutral">est.</Badge>
              )}
            </td>
            <td className="px-5 py-3 text-xs font-mono">
              {l.fechaAcreditacion ? formatDate(l.fechaAcreditacion) : "—"}
            </td>
            <td className="px-5 py-3 text-center">
              <Badge tone="success">Acreditado</Badge>
            </td>
          </tr>
        ))}
      </TablaLiquidaciones>
      <PaginacionTabla p={pag} />
    </div>
  );
}
