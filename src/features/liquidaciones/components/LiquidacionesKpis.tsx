import type { ReactNode } from "react";
import { Clock, Percent, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";

// No usa `KpiCard` de shared: estas tarjetas llevan borde lateral de color,
// ícono y valor coloreado, y cambiaría notablemente el aspecto.
function Kpi({
  borde,
  icon,
  label,
  valor,
  colorValor = "",
  sub,
  loading,
}: {
  borde: string;
  icon: ReactNode;
  label: string;
  valor: number;
  colorValor?: string;
  sub: string;
  loading: boolean;
}) {
  return (
    <Card className={`border-l-4 ${borde}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div
        className={`font-display tabular-nums text-xl md:text-2xl font-bold mt-1 ${colorValor}`.trim()}
      >
        {loading ? "—" : formatMoney(valor)}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </Card>
  );
}

/** Falta cobrar / Por acreditar / Adelantos en curso / Disponible real. */
export function LiquidacionesKpis({
  loading,
  faltaCobrar,
  porAcreditar,
  adelantosEnCurso,
  disponible,
}: {
  loading: boolean;
  faltaCobrar: number;
  porAcreditar: number;
  adelantosEnCurso: number;
  disponible: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Kpi
        borde="border-l-amber-500"
        icon={<Clock size={12} />}
        label="Falta cobrar"
        valor={faltaCobrar}
        sub="Ventas sin lote aún"
        loading={loading}
      />
      <Kpi
        borde="border-l-blue-500"
        icon={<Wallet size={12} />}
        label="Por acreditar"
        valor={porAcreditar}
        colorValor="text-blue-700"
        sub="Lotes no Acreditados"
        loading={loading}
      />
      <Kpi
        borde="border-l-amber-600"
        icon={<Percent size={12} />}
        label="Adelantos en curso"
        valor={adelantosEnCurso}
        colorValor="text-amber-700"
        sub="Pendiente + Aprobado"
        loading={loading}
      />
      <Kpi
        borde="border-l-emerald-500"
        icon={<TrendingUp size={12} />}
        label="Disponible real"
        valor={disponible}
        colorValor="text-emerald-700"
        sub="Por acreditar − en curso"
        loading={loading}
      />
    </div>
  );
}
