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
import { PALETTE, pdvColor, statusColor } from "../estados";
import type { Porcion, PuntoEvolucion } from "../utils";

/** Charts */
export function GraficosQr({
  statusData,
  pdvData,
  evolucion,
}: {
  statusData: Porcion[];
  pdvData: Porcion[];
  evolucion: PuntoEvolucion[];
}) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
      <Card>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Estado de cobros
        </h4>
        {statusData.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, value }: { name?: string; value?: number }) => name + " " + value}
              >
                {statusData.map((e, i) => (
                  <Cell key={e.name} fill={statusColor(e.name, i)} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Puntos de venta por estado
        </h4>
        {pdvData.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pdvData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, value }: { name?: string; value?: number }) => name + " " + value}
              >
                {pdvData.map((e) => (
                  <Cell key={e.name} fill={pdvColor(e.name)} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="md:col-span-2 xl:col-span-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Evolucion de cobros (millones ARS)
        </h4>
        {evolucion.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={evolucion}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cobros"
                stroke={PALETTE[0]}
                strokeWidth={2}
                name="Cobros"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="monto"
                stroke={PALETTE[1]}
                strokeWidth={2}
                name="Monto (millones ARS)"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      Sin datos en el periodo seleccionado
    </div>
  );
}
