import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Link2, Users, Wallet } from "lucide-react";
import { Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import type { KpisDashboard } from "../utils";

export function Kpi({
  label,
  value,
  sub,
  icon,
  iconClass,
  info,
  infoAlign = "left",
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  icon: ReactNode;
  iconClass: string;
  /** De dónde sale el dato; se muestra con una «i» al pasar el mouse. */
  info?: ReactNode;
  infoAlign?: "left" | "right";
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-black-400 mb-1">
            {label}
            {info && (
              <InfoTip align={infoAlign} className="ml-1">
                {info}
              </InfoTip>
            )}
          </div>
          <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-black-800">
            {value}
          </div>
          <div className="text-xs text-black-400 mt-0.5">{sub}</div>
        </div>
        <div
          className={`w-9 h-9 rounded-sm flex items-center justify-center shrink-0 ${iconClass}`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

/** Las dos filas de KPIs del dashboard. */
export function DashboardKpis({ kpis, cuentaLabel }: { kpis: KpisDashboard; cuentaLabel: string }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Kpi
          label="Saldo total de la cuenta"
          value={formatMoney(kpis.saldo)}
          sub={cuentaLabel || "Sin CLABE asignada"}
          info="Suma del saldo de todas tus subcuentas en JPay: lo disponible más lo retenido por operaciones en curso. Es el saldo de hoy; no depende del período elegido."
          icon={<Wallet size={18} />}
          iconClass="bg-secondary-50 text-secondary-500"
        />
        <Kpi
          label="Depósitos del período"
          value={formatMoney(kpis.depositos)}
          sub={`${kpis.opsDep} operaciones`}
          info="Suma de los depósitos registrados en tu cuenta JPay en el período elegido, en cualquier estado."
          icon={<ArrowDownLeft size={18} />}
          iconClass="bg-success-bg text-success"
        />
        <Kpi
          label="Retiros del período"
          value={formatMoney(kpis.retiros)}
          sub={`${kpis.opsRet} operaciones`}
          info="Suma de los retiros registrados en tu cuenta JPay en el período elegido, en cualquier estado. No incluye las transferencias SPEI enviadas: esas las ves en Transferencias SPEI."
          icon={<ArrowUpRight size={18} />}
          iconClass="bg-error-bg text-error"
        />
        <Kpi
          label="Total de cuentas"
          value={kpis.cuentas}
          sub={`1 principal + ${kpis.cuentas - 1} subcuentas`}
          info="Tu cuenta principal más las subcuentas que creaste en JPay."
          infoAlign="right"
          icon={<Users size={18} />}
          iconClass="bg-info-bg text-info"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Kpi
          label="Cobros mediante Link de Pago"
          value={formatMoney(kpis.cobrosLink)}
          sub={`${kpis.opsLink} transacciones`}
          info="Suma de los cobros con tarjeta de tus links de pago registrados en JPay en el período elegido, en cualquier estado (aprobados, pendientes o rechazados)."
          icon={<Link2 size={18} />}
          iconClass="bg-secondary-50 text-secondary-500"
        />
      </div>
    </>
  );
}
