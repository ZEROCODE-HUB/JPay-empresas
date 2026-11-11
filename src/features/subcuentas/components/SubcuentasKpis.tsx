import { PieChart } from "lucide-react";
import type { ReactNode } from "react";
import { formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import type { Sub } from "../types";
import { pctSaldo, totalesSubs } from "../utils";
import { brand } from "@/brand/brand";

function Kpi({
  label,
  value,
  sub,
  info,
  infoAlign = "left",
}: {
  label: string;
  value: string;
  sub: string;
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
      <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

/** Saldo total, disponible, retenido y distribución del saldo entre subcuentas. */
export function SubcuentasKpis({ subs }: { subs: Sub[] }) {
  const { total, disp, ret, totalUsd, dispUsd, retUsd, hayUsd } = totalesSubs(subs);
  const usd = (n: number) => formatMoney(n, { moneda: "USD" });
  const pesos = subs.filter((s) => s.moneda !== "USD");
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Kpi
        label="Saldo total"
        value={formatMoney(total)}
        sub={hayUsd ? `+ ${usd(totalUsd)} en dólares` : `${subs.length} subcuentas`}
        info={`Disponible más retenido de tus subcuentas en pesos, según los movimientos registrados en ${brand.name}. Es el saldo de hoy. Tu subcuenta en dólares se muestra aparte, en dólares: no se suman pesos con dólares.`}
      />
      <Kpi
        label="Disponible"
        value={formatMoney(disp)}
        sub={hayUsd ? `+ ${usd(dispUsd)} en dólares` : "Listo para operar"}
        info="Suma de lo que puedes usar ya en tus subcuentas en pesos: transferir, convertir o retirar. Lo disponible en dólares se muestra aparte."
        infoAlign="right"
      />
      <Kpi
        label="Retenido"
        value={formatMoney(ret)}
        sub={hayUsd && retUsd > 0 ? `+ ${usd(retUsd)} en dólares` : "Pendiente de liberar"}
        info="Dinero apartado en tus subcuentas en pesos para operaciones que todavía no se confirman (por ejemplo, transferencias o conversiones en curso). Se libera o se descuenta al terminar. Lo apartado en dólares se muestra aparte."
      />
      <div className="bg-card border rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <PieChart size={11} /> Distribución del saldo
          <InfoTip align="right">
            Saldo (disponible más retenido) de cada subcuenta en pesos y qué porcentaje representa
            del saldo total en pesos. Se muestran las tres primeras de la lista.
          </InfoTip>
        </div>
        <div className="text-[10px] mt-1.5 space-y-1.5">
          {pesos.slice(0, 3).map((s) => {
            const pct = pctSaldo(s, total);
            return (
              <div key={s.id ?? s.n}>
                <div className="flex justify-between text-[10px] leading-tight">
                  <span className="truncate mr-1">{s.n}</span>
                  <span className="font-semibold shrink-0">
                    {formatMoney(s.disp + s.ret)} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-0.5">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: s.color }}
                  />
                </div>
              </div>
            );
          })}
          {pesos.length > 3 && (
            <div className="text-[10px] text-muted-foreground pt-0.5">+{pesos.length - 3} más</div>
          )}
          {subs.length === 0 && (
            <div className="text-[10px] text-muted-foreground pt-0.5">Sin subcuentas</div>
          )}
        </div>
      </div>
    </div>
  );
}
