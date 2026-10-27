import type { ReactNode } from "react";
import { Landmark, SlidersHorizontal } from "lucide-react";
import { brand } from "@/brand/brand";
import { Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import type { CuentaPantalla } from "../hooks/useCuentaPantalla";

function Fila({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function LimitesCard({ c }: { c: CuentaPantalla }) {
  return (
    <Card>
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <SlidersHorizontal size={14} /> Limites operativos
      </h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        Configurados por {brand.company.shortName}. Para modificarlos contacta a tu ejecutivo.
      </p>
      <div className="space-y-2 text-sm">
        <Fila
          label="Monto max. por transferencia"
          value={formatMoney(c.cliente?.limite_transferencia, { decimals: 0 })}
        />
        <Fila label="Operaciones diarias" value={c.cliente?.limite_ops_diarias ?? "—"} />
        <Fila
          label="Monto acumulado diario"
          value={formatMoney(c.cliente?.limite_monto_diario, { decimals: 0 })}
        />
      </div>
    </Card>
  );
}

/**
 * Columna derecha de "Mi cuenta": CVU y límites. Plan, facturación, representantes
 * legales y constancia de CBU no tienen datos ni funciones en el backend todavía.
 */
export function CuentaSidebar({ c }: { c: CuentaPantalla }) {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Landmark size={16} className="shrink-0 text-primary-ink" />
          Informacion de CVU
        </h3>
        <div className="text-xs space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">CVU</span>
            <span className="font-mono font-semibold truncate">{c.cbu.cbu}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Alias</span>
            <span className="font-mono font-semibold truncate">{c.cbu.alias}</span>
          </div>
        </div>
      </Card>

      <LimitesCard c={c} />
    </div>
  );
}
