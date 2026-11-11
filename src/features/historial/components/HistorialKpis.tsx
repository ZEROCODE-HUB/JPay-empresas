import { Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import { Cargando } from "@/shared/ui/estado-carga";
import type { TotalesHistorial } from "../utils";

/** KPIs de la página actual: ingresos, egresos, neto y pendientes/rechazados. */
export function HistorialKpis({
  totales: t,
  cargando = false,
}: {
  totales: TotalesHistorial;
  /** Mientras carga: bloques grises en vez de $0. */
  cargando?: boolean;
}) {
  if (cargando) {
    return (
      <div className="grid md:grid-cols-4 gap-5 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <Cargando key={i} className="block h-[6.5rem] w-full" />
        ))}
      </div>
    );
  }
  const neto = t.totalIngresos - t.totalEgresos;
  const m = { moneda: t.moneda };
  const otra = t.moneda === "USD" ? "MXN" : "USD";
  return (
    <div className="grid md:grid-cols-4 gap-5 mb-6">
      <Card className="p-5">
        <div className="text-xs text-muted-foreground mb-1">
          Ingresos del periodo
          <InfoTip className="ml-1">
            Suma de los movimientos a favor de TODO el período y los filtros que elegiste (no solo
            de la página que ves), en la moneda de la subcuenta que ves. Solo lo confirmado: lo
            rechazado y lo pendiente se cuentan aparte. Pesos y dólares no se mezclan.
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
            Suma de los movimientos en contra (salidas, comisiones e impuestos) de TODO el período y
            los filtros que elegiste, en la moneda de la subcuenta que ves. Solo lo confirmado.
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
            Ingresos menos egresos de todo el período y los filtros que elegiste. Se suma en pesos,
            o en dólares si filtras tu subcuenta en dólares; lo de la otra moneda se muestra abajo,
            aparte: no se mezclan pesos con dólares. Una conversión o un envío en proceso aparece en
            la tabla como «pendiente» con lo apartado, y no entra en el neto hasta que termina.
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
            Operaciones del período y los filtros que elegiste que siguen en proceso o fueron
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
