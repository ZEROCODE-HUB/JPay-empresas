import type { ReactNode } from "react";
import type { DashboardKPI } from "@/lib/api/cobros-masivos";
import { formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";

function Kpi({
  label,
  value,
  color,
  info,
  infoAlign = "left",
}: {
  label: string;
  value: string | number;
  color?: string;
  /** De dónde sale el dato; se muestra con una «i» al pasar el mouse. */
  info: ReactNode;
  infoAlign?: "left" | "right";
}) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        <InfoTip align={infoAlign} className="ml-1">
          {info}
        </InfoTip>
      </div>
      <div
        className={`font-display tabular-nums text-sm md:text-base font-semibold mt-0.5${color ? ` ${color}` : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Fila de 7 KPIs del dashboard de cobros masivos. */
export function DashboardKpis({ kpi }: { kpi: DashboardKPI }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
      {/* Las impares quedan a la derecha en el celular; las dos últimas, en escritorio. */}
      <Kpi
        label="Total de lotes"
        value={kpi.totalLotes}
        info="Lotes de cobro que creaste en el período elegido (por fecha de creación). No cuenta los eliminados."
      />
      <Kpi
        label="En proceso"
        value={kpi.enProceso}
        color="text-amber-600"
        info="Lotes del período que siguen abiertos cobrando."
        infoAlign="right"
      />
      <Kpi
        label="Finalizados"
        value={kpi.finalizados}
        color="text-emerald-600"
        info="Lotes del período que ya terminaron."
      />
      <Kpi
        label="Con error"
        value={kpi.conError}
        color="text-danger-600"
        info="Lotes del período que quedaron con error al procesarse."
        infoAlign="right"
      />
      <Kpi
        label="Monto total"
        value={formatMoney(kpi.montoTotal)}
        info="Suma de lo que hay que cobrar en todos los registros de los lotes del período."
      />
      <Kpi
        label="Cobrado"
        value={formatMoney(kpi.montoCobrado)}
        color="text-emerald-600"
        info="Lo que tus clientes ya pagaron de esos registros, incluidos los pagos parciales."
        infoAlign="right"
      />
      <Kpi
        label="Pendiente"
        value={formatMoney(kpi.montoPendiente)}
        color="text-amber-600"
        info="Monto total menos lo cobrado: lo que falta cobrar de los lotes del período, venza o no."
        infoAlign="right"
      />
    </div>
  );
}
