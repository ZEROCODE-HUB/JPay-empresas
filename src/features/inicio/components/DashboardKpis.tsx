import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Link2,
  QrCode,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import type { KpisDashboard } from "../utils";

function Kpi({
  label,
  value,
  sub,
  icon,
  iconClass,
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-black-400 mb-1">{label}</div>
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
export function DashboardKpis({ kpis, cbuLabel }: { kpis: KpisDashboard; cbuLabel: string }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Kpi
          label="Saldo total de la cuenta"
          value={formatMoney(kpis.saldo)}
          sub={cbuLabel || "Sin CVU asignada"}
          icon={<Wallet size={18} />}
          iconClass="bg-secondary-50 text-secondary-500"
        />
        <Kpi
          label="Depósitos del período"
          value={formatMoney(kpis.depositos)}
          sub={`${kpis.opsDep} operaciones`}
          icon={<ArrowDownLeft size={18} />}
          iconClass="bg-success-bg text-success"
        />
        <Kpi
          label="Retiros del período"
          value={formatMoney(kpis.retiros)}
          sub={`${kpis.opsRet} operaciones`}
          icon={<ArrowUpRight size={18} />}
          iconClass="bg-error-bg text-error"
        />
        <Kpi
          label="Total de cuentas"
          value={kpis.cuentas}
          sub={`1 principal + ${kpis.cuentas - 1} subcuentas`}
          icon={<Users size={18} />}
          iconClass="bg-info-bg text-info"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <Kpi
          label="Cobros mediante Link de Pago"
          value={formatMoney(kpis.cobrosLink)}
          sub={`${Math.round(kpis.cobrosLink / 85000)} transacciones`}
          icon={<Link2 size={18} />}
          iconClass="bg-secondary-50 text-secondary-500"
        />
        <Kpi
          label="Cobros mediante Código QR"
          value={formatMoney(kpis.cobrosQR)}
          sub={`${Math.round(kpis.cobrosQR / 32000)} transacciones`}
          icon={<QrCode size={18} />}
          iconClass="bg-warning-bg text-warning"
        />
        <Kpi
          label="Pagos realizados mediante QR"
          value={formatMoney(kpis.pagosQR)}
          sub={`${Math.round(kpis.pagosQR / 18000)} transacciones`}
          icon={<Smartphone size={18} />}
          iconClass="bg-plata-200 text-black-600"
        />
      </div>
    </>
  );
}
