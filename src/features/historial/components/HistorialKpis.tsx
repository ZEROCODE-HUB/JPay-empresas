import { Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import type { TotalesHistorial } from "../utils";

/** KPIs de la página actual: ingresos, egresos, neto y pendientes/rechazados. */
export function HistorialKpis({ totales: t }: { totales: TotalesHistorial }) {
  const neto = t.totalIngresos - t.totalEgresos;
  const m = { moneda: t.moneda };
  const otra = t.moneda === "USD" ? "MXN" : "USD";
  return (
    <div className="grid md:grid-cols-4 gap-5 mb-6">
      <Card className="p-5">
        <div className="text-xs text-muted-foreground mb-1">
          Ingresos del periodo
          <InfoTip className="ml-1">
            Suma (en la moneda de la subcuenta que ves) de los movimientos a favor que ves en esta
            página de la tabla, con los filtros que elegiste. Si hay más páginas, sus movimientos no
            entran en la suma. Los movimientos de tu subcuenta en dólares no se suman aquí.
          </InfoTip>
        </div>
        <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-emerald-700">
          {formatMoney(t.totalIngresos, m)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{t.lineasIngreso} líneas</div>
      </Card>
      <Card className="p-5">
        <div className="text-xs text-muted-foreground mb-1">
          Egresos del periodo
          <InfoTip className="ml-1">
            Suma (en la moneda de la subcuenta que ves) de los movimientos en contra (salidas,
            comisiones e impuestos) que ves en esta página de la tabla, con los filtros que
            elegiste.
          </InfoTip>
        </div>
        <div className="text-xl md:text-2xl font-bold text-foreground">
          {formatMoney(t.totalEgresos, m)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {t.lineasEgreso} líneas (incluye comisiones e impuestos)
        </div>
      </Card>
      <Card className="p-5">
        <div className="text-xs text-muted-foreground mb-1">
          Neto
          <InfoTip className="ml-1">
            Ingresos menos egresos de los movimientos que ves en esta página de la tabla. Se suma en
            pesos, o en dólares si filtras tu subcuenta en dólares; lo de la otra moneda se muestra
            abajo, aparte: no se mezclan pesos con dólares. Una conversión en proceso se ve en tu
            subcuenta en pesos como pendiente; los dólares aparecen cuando Cobre la termina.
          </InfoTip>
        </div>
        <div
          className={`font-display tabular-nums text-xl md:text-2xl font-bold ${neto >= 0 ? "text-emerald-700" : "text-danger-600"}`}
        >
          {neto >= 0 ? "+ " : "- "}
          {formatMoney(Math.abs(neto), m)}
        </div>
        {t.lineasOtra > 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            {otra === "USD" ? "En dólares" : "En pesos"}:{" "}
            {formatMoney(t.netoOtra, { signo: true, moneda: otra })}
          </div>
        )}
      </Card>
      <Card className="p-5">
        <div className="text-xs text-muted-foreground mb-1">
          Pendientes / Rechazados
          <InfoTip align="right" className="ml-1">
            Cantidad de operaciones de esta página de la tabla que siguen pendientes o fueron
            rechazadas. Cada operación cuenta una vez aunque tenga varias líneas.
          </InfoTip>
        </div>
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
