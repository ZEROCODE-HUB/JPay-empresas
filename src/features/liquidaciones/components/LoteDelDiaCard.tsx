import { brand } from "@/brand/brand";
import { Card } from "@/components/portal-shell";
import type { CalendarioAcreditacion } from "@/lib/api/calendario-acreditaciones";
import { formatMoney } from "@/shared/format";
import { ESTADO_CAL_COLORS } from "../estados";
import { comisionCierrePct, netoFinalLote } from "../utils";

/** Desglose bruto → neto de un lote dentro del modal del día. */
export function LoteDelDiaCard({ it }: { it: CalendarioAcreditacion }) {
  const color = ESTADO_CAL_COLORS[it.estadoCalculado];
  return (
    <Card className="p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-semibold text-sm">
            {it.bandera} · {it.codigo}
          </div>
          <div className="text-xs text-muted-foreground">{it.cantidadOperaciones} operaciones</div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${color.bg} ${color.text}`}>
          {color.label}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left py-1 font-medium">Concepto</th>
              <th className="text-right py-1 font-medium">Importe</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            <tr>
              <td className="py-1">Importe bruto del lote</td>
              <td className="text-right">{formatMoney(it.importeBruto)}</td>
            </tr>
            <tr className="text-danger-600">
              <td className="py-1">
                (-) Comisión {brand.name} ({it.tasaPropiaPct.toFixed(2)}%)
              </td>
              <td className="text-right">-{formatMoney(it.tasaPropiaMonto)}</td>
            </tr>
            <tr className="text-danger-600">
              <td className="py-1">(-) Comisión PayWay ({it.tasaPaywayPct.toFixed(2)}%)</td>
              <td className="text-right">-{formatMoney(it.tasaPaywayMonto)}</td>
            </tr>
            <tr className="text-danger-600">
              <td className="py-1">
                (-) Comisión cierre de lote ({comisionCierrePct(it).toFixed(2)}%)
              </td>
              <td className="text-right">-{formatMoney(it.comisionCierreLoteMonto)}</td>
            </tr>
            <tr className="text-danger-600">
              <td className="py-1">(-) Impuestos</td>
              <td className="text-right">-{formatMoney(it.impuestos)}</td>
            </tr>
            {it.contracargoMonto > 0 && (
              <tr className="text-danger-600">
                <td className="py-1">(-) Contracargo</td>
                <td className="text-right">-{formatMoney(it.contracargoMonto)}</td>
              </tr>
            )}
            {it.adelantosAplicadosDia > 0 && (
              <tr className="text-amber-700">
                <td className="py-1">(-) Adelanto aplicado a este día</td>
                <td className="text-right">-{formatMoney(it.adelantosAplicadosDia)}</td>
              </tr>
            )}
            <tr className="border-t-2 font-semibold">
              <td className="py-1.5">= Neto a recibir en tu Operativa</td>
              <td className="text-right text-emerald-700">{formatMoney(netoFinalLote(it))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
