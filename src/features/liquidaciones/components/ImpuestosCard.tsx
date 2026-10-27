import { Percent } from "lucide-react";
import { brand } from "@/brand/brand";
import { Badge, Card } from "@/components/portal-shell";
import type { Excepcion, Impuesto } from "@/lib/api/liquidaciones";
import { formatDate, formatMoney } from "@/shared/format";
import { tonoEstadoImpuesto } from "../estados";

/** Valor del impuesto: porcentaje o importe fijo según `tipo`; "—" si no tiene. */
function valorImpuesto(imp: Impuesto): string {
  if (imp.monto == null) return "—";
  return imp.tipo === "Porcentaje" ? `${imp.monto}%` : formatMoney(imp.monto);
}

/** Impuestos de ámbito Externo aplicables al comercio y sus excepciones. */
export function ImpuestosCard({
  impuestos,
  excepciones,
}: {
  impuestos: Impuesto[];
  excepciones: Excepcion[];
}) {
  if (impuestos.length === 0) return null;
  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Percent size={16} className="text-muted-foreground" />
        <h3 className="font-semibold text-sm">Impuestos aplicables a tu comercio</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Solo se muestran impuestos de ámbito Externo. Los impuestos internos de {brand.name} no se
        visualizan.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2">Código</th>
              <th className="text-left px-4 py-2">Descripción</th>
              <th className="text-right px-4 py-2">Tipo</th>
              <th className="text-right px-4 py-2">Alicuota / Fijo</th>
              <th className="text-center px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {impuestos.map((imp) => {
              const exento = excepciones.find(
                (e) => e.impuestoCodigo === imp.codigo && e.estado === "Activo",
              );
              return (
                <tr key={imp.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs">{imp.codigo}</td>
                  <td className="px-4 py-2 text-xs">{imp.descripcion}</td>
                  <td className="px-4 py-2 text-right text-xs">{imp.tipo}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">
                    {valorImpuesto(imp)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {exento ? (
                      <Badge tone="success">Exento</Badge>
                    ) : (
                      <Badge tone={tonoEstadoImpuesto(imp.estado)}>{imp.estado}</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {excepciones.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <div className="text-xs font-semibold text-muted-foreground mb-1">
            Excepciones activas
          </div>
          {excepciones.map((exc, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <Badge tone="success">Exento</Badge>
              <span>
                {exc.impuestoCodigo} — {exc.motivo}
              </span>
              {exc.vigenciaHasta && (
                <span className="text-muted-foreground">
                  (hasta {formatDate(exc.vigenciaHasta)})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
