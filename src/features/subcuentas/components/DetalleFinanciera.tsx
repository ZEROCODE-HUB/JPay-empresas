import { Building2, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import { copiarClabe } from "../export";
import type { Sub } from "../types";
import { fmtLimite } from "../utils";

type Props = {
  sub: Sub;
  totalDepositos: number;
  totalRetiros: number;
  onFondear: () => void;
};

function Dato({
  label,
  value,
  className = "",
  info,
  infoAlign = "left",
}: {
  label: string;
  value: string;
  className?: string;
  /** De dónde sale el dato; se muestra con una «i» al pasar el mouse. */
  info: ReactNode;
  infoAlign?: "left" | "right";
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
        <InfoTip align={infoAlign} className="ml-1">
          {info}
        </InfoTip>
      </div>
      <div className={`font-display tabular-nums text-base font-semibold mt-1 ${className}`}>
        {value}
      </div>
    </div>
  );
}

export function DetalleFinanciera({ sub, totalDepositos, totalRetiros, onFondear }: Props) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Informacion financiera</h3>
        <button
          onClick={onFondear}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition text-muted-foreground hover:text-foreground"
          title="Mover fondos"
        >
          <Building2 size={13} />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Dato
          label="Balance actual"
          value={formatMoney(sub.disp)}
          info="Saldo disponible de esta subcuenta hoy. No incluye lo retenido por operaciones en curso."
        />
        <Dato
          label="Total depositos"
          value={formatMoney(totalDepositos)}
          className="text-emerald-700"
          info="Suma de las entradas de esta subcuenta (depósitos, conversiones y otros ingresos) entre sus 200 movimientos más recientes, en cualquier estado."
          infoAlign="right"
        />
        <Dato
          label="Total retiros"
          value={formatMoney(totalRetiros)}
          className="text-danger-700"
          info="Suma de las transferencias y retiros de esta subcuenta entre sus 200 movimientos más recientes, en cualquier estado."
        />
        <Dato
          label="Limite diario"
          value={fmtLimite(sub.lim)}
          className={sub.lim ? "" : "text-muted-foreground"}
          info="Tope diario que configuraste para esta subcuenta."
          infoAlign="right"
        />
        <div className="bg-muted/30 rounded-lg p-3 sm:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">CLABE</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-xs font-semibold truncate">
                {sub.cbu || "Sin CLABE"}
              </span>
              {sub.cbu && (
                <button
                  onClick={() => copiarClabe(sub.cbu)}
                  className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  title="Copiar CLABE"
                >
                  <Copy size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
