import { Activity, Shield, TrendingUp, User } from "lucide-react";
import { formatNumber } from "@/shared/format";
import type { CuentaPantalla } from "../hooks/useCuentaPantalla";
import { labelKyc } from "../utils";

export function CuentaStats({ c }: { c: CuentaPantalla }) {
  const stats = [
    {
      icon: Shield,
      label: "Estado KYC",
      value: labelKyc(c.aprobado, c.cliente?.estado_onboarding),
      sub: c.aprobado ? "Verificado" : "En revisión",
    },
    { icon: Activity, label: "Transacciones mes", value: formatNumber(c.movCount) },
    { icon: User, label: "Antigüedad", value: c.antiguedad },
    {
      icon: TrendingUp,
      label: "Score de seguridad",
      value: `${c.score} / 100`,
      sub: "Recomendado: 80+",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
      {stats.map((s) => (
        <div key={s.label} className="bg-card border rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
            <s.icon size={12} className="shrink-0" />
            {s.label}
          </div>
          <div className="font-display tabular-nums text-sm font-semibold mt-0.5">{s.value}</div>
          {s.sub && <div className="text-[9px] text-muted-foreground">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}
