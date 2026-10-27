import { Building2, Copy } from "lucide-react";
import { formatMoney } from "@/shared/format";
import { copiarCvu } from "../export";
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
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
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
        <Dato label="Balance actual" value={formatMoney(sub.disp)} />
        <Dato
          label="Total depositos"
          value={formatMoney(totalDepositos)}
          className="text-emerald-700"
        />
        <Dato label="Total retiros" value={formatMoney(totalRetiros)} className="text-danger-700" />
        <Dato
          label="Limite diario"
          value={fmtLimite(sub.lim)}
          className={sub.lim ? "" : "text-muted-foreground"}
        />
        <div className="bg-muted/30 rounded-lg p-3 sm:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">CVU</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-xs font-semibold truncate">
                {sub.cbu || "Sin CVU"}
              </span>
              {sub.cbu && (
                <button
                  onClick={() => copiarCvu(sub.cbu)}
                  className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  title="Copiar CVU"
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
