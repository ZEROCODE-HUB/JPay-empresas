import type { ReactNode } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/portal-shell";
import {
  medioPagoLabels,
  type EvolucionData,
  type MedioPagoData,
  type NoCobradasData,
  type VencimientoData,
} from "@/lib/api/cobros-masivos";
import { formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";

const MEDIO_COLORS: Record<string, string> = {
  TRANSFERENCIA: "var(--brand-secondary-500)",
  TARJETA_CREDITO: "var(--brand-primary-500)",
  TARJETA_DEBITO: "#000000",
};

const VENC_COLORS = ["var(--success)", "var(--warning)", "var(--danger-500)"];

function Titulo({
  children,
  info,
  infoAlign = "left",
}: {
  children: ReactNode;
  info: ReactNode;
  infoAlign?: "left" | "right";
}) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {children}
      <InfoTip align={infoAlign} className="ml-1">
        {info}
      </InfoTip>
    </h4>
  );
}

function Metrica({ valor, label, color }: { valor: number; label: string; color?: string }) {
  return (
    <div>
      <div className={`font-display tabular-nums text-lg font-semibold${color ? ` ${color}` : ""}`}>
        {valor}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

/** Tortas por medio de pago y por vencimiento + card de operaciones no cobradas. */
export function DashboardGraficos({
  porMedio,
  porVencimiento,
  noCobradas,
}: {
  porMedio: MedioPagoData[];
  porVencimiento: VencimientoData[];
  noCobradas: NoCobradasData;
}) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
      <Card>
        <Titulo info="Reparto de lo cobrado en el período según el medio con que pagaron tus clientes. JPay todavía no registra el medio de pago de los cobros masivos, así que por ahora el gráfico aparece vacío.">
          Cobros por medio de pago
        </Titulo>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={porMedio}
              dataKey="monto"
              nameKey="medio"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ medio, porcentaje }: { medio: string; porcentaje: number }) =>
                `${medioPagoLabels[medio as keyof typeof medioPagoLabels] || medio} ${porcentaje}%`
              }
            >
              {porMedio.map((e) => (
                <Cell key={e.medio} fill={MEDIO_COLORS[e.medio] || "#666"} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatMoney(v)} />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <Titulo info="Cobros del período según en qué vencimiento se pagaron (1.º, 2.º o 3.º). JPay todavía no registra este dato, así que por ahora todo aparece en cero.">
          Cobros por vencimiento
        </Titulo>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={porVencimiento}
              dataKey="cantidad"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ label, cantidad }: { label: string; cantidad: number }) =>
                `${label}: ${cantidad}`
              }
            >
              {porVencimiento.map((_, i) => (
                <Cell key={i} fill={VENC_COLORS[i]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <Titulo
          info="Registros de los lotes del período que no se pagaron completos. «Vencidas» ya pasaron su vencimiento; «Vigentes», todavía no. El porcentaje es el monto que falta cobrar sobre el monto total de esos lotes."
          infoAlign="right"
        >
          Operaciones no cobradas
        </Titulo>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">No cobrado</span>
            <span className="text-lg font-bold text-danger-600">
              {noCobradas.porcentajeNoCobrado}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-danger-500"
              style={{ width: `${noCobradas.porcentajeNoCobrado}%` }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center pt-2">
            <Metrica valor={noCobradas.totalOperaciones} label="Total ops" />
            <Metrica valor={noCobradas.vencidas} label="Vencidas" color="text-danger-600" />
            <Metrica valor={noCobradas.vigentes} label="Vigentes" color="text-amber-600" />
          </div>
          <div className="text-xs text-muted-foreground text-center pt-1">
            Monto no cobrado: {formatMoney(noCobradas.montoNoCobrado)}
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Línea de evolución de pagos en el período. */
export function EvolucionPagos({ evolucion }: { evolucion: EvolucionData[] }) {
  return (
    <Card className="mb-6">
      <Titulo info="Lo cobrado día a día en el período. JPay todavía no registra la fecha de cada pago de los cobros masivos, así que por ahora el gráfico aparece vacío.">
        Evolucion de pagos
      </Titulo>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={evolucion}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => formatMoney(v)} />
          <Legend />
          <Line
            type="monotone"
            dataKey="monto"
            stroke="var(--brand-primary-500)"
            strokeWidth={2}
            name="Monto"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
