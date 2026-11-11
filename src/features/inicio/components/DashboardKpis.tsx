import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Link2, Users, Wallet } from "lucide-react";
import { Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import { Cargando } from "@/shared/ui/estado-carga";
import type { KpisDashboard } from "../utils";
import { brand } from "@/brand/brand";

export function Kpi({
  label,
  value,
  sub,
  icon,
  iconClass,
  info,
  infoAlign = "left",
  loading = false,
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  icon: ReactNode;
  iconClass: string;
  /** De dónde sale el dato; se muestra con una «i» al pasar el mouse. */
  info?: ReactNode;
  infoAlign?: "left" | "right";
  /** Mientras carga: gris animado en vez del valor (nunca $0). */
  loading?: boolean;
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
            {loading ? <Cargando className="h-7 w-28" /> : value}
          </div>
          <div className="text-xs text-black-400 mt-0.5">
            {loading ? <Cargando className="h-3 w-20" /> : sub}
          </div>
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
export function DashboardKpis({
  kpis,
  cuentaLabel,
  loading = false,
}: {
  kpis: KpisDashboard;
  cuentaLabel: string;
  loading?: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Kpi
          loading={loading}
          label="Saldo total de la cuenta"
          value={formatMoney(kpis.saldo)}
          sub={
            kpis.hayUsd
              ? `+ ${formatMoney(kpis.saldoUsd, { moneda: "USD" })} en dólares`
              : cuentaLabel || "Sin CLABE asignada"
          }
          info={`Suma del saldo de tus subcuentas en pesos en ${brand.name}: lo disponible más lo retenido por operaciones en curso. Es el saldo de hoy; no depende del período elegido. Tu subcuenta en dólares se muestra aparte, en dólares.`}
          icon={<Wallet size={18} />}
          iconClass="bg-secondary-50 text-secondary-500"
        />
        <Kpi
          loading={loading}
          label="Depósitos del período"
          value={formatMoney(kpis.depositos)}
          sub={`${kpis.opsDep} operaciones`}
          info={`Depósitos en pesos que entraron a tu cuenta ${brand.name} en el período elegido (por SPEI a tu CLABE o por tus cobros por SPEI). Solo los acreditados; los rechazados o devueltos no cuentan.`}
          icon={<ArrowDownLeft size={18} />}
          iconClass="bg-success-bg text-success"
        />
        <Kpi
          loading={loading}
          label="Salidas del período"
          value={formatMoney(kpis.salidas)}
          sub={`${kpis.opsSal} operaciones`}
          info={`Todo lo que salió de tus subcuentas en pesos en el período: transferencias SPEI, conversiones a dólares y retiros, sin contar comisiones e IVA (en el período sumaron ${formatMoney(kpis.comisiones)}). Solo lo confirmado: un envío rechazado o devuelto no cuenta.`}
          icon={<ArrowUpRight size={18} />}
          iconClass="bg-error-bg text-error"
        />
        <Kpi
          loading={loading}
          label="Total de cuentas"
          value={kpis.cuentas}
          sub={kpis.hayUsd ? "en pesos y en dólares" : "subcuentas"}
          info={`Todas tus subcuentas en ${brand.name}, en pesos y en dólares.`}
          infoAlign="right"
          icon={<Users size={18} />}
          iconClass="bg-info-bg text-info"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Kpi
          loading={loading}
          label="Cobros con tarjeta"
          value={formatMoney(kpis.cobrosLink)}
          sub={`${kpis.opsLink} cobros${kpis.tarjetaPruebas ? " de prueba" : ""}`}
          info={`Cobros con tarjeta pagados en el período (links de pago y puntos físicos), menos lo reembolsado. Los pendientes y rechazados no cuentan.${kpis.tarjetaPruebas ? " Todavía no tienes cobros reales: estos son de prueba." : ""}`}
          icon={<Link2 size={18} />}
          iconClass="bg-secondary-50 text-secondary-500"
        />
      </div>
    </>
  );
}
