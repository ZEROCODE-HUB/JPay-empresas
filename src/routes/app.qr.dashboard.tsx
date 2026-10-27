import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  Download,
  FileSpreadsheet,
  TrendingUp,
  QrCode,
  DollarSign,
  Activity,
  Store,
} from "lucide-react";
import { Card, BtnOutline, PageHeader } from "@/components/portal-shell";
import { useDashboardQr } from "@/hooks/useQr";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { formatMoney } from "@/shared/format";

export const Route = createFileRoute("/app/qr/dashboard")({ component: Dashboard });

const PRESETS = [
  { label: "Hoy", days: 0 },
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "60 dias", days: 60 },
  { label: "90 dias", days: 90 },
];

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#dc2626",
  "#d97706",
  "#0891b2",
  "#4f46e5",
  "#9333ea",
  "#16a34a",
  "#ca8a04",
];
const STATUS_COLOR: Record<string, string> = {
  Aprobado: "#22c55e",
  Pendiente: "#f59e0b",
  Rechazado: "#ef4444",
  Reembolsado: "#a855f7",
};

type Kpi = { icon: typeof QrCode; label: string; value: string };

function Dashboard() {
  const [presetLabel, setPresetLabel] = useState(PRESETS[2].label);
  const sinceIso = useMemo(() => {
    const days = PRESETS.find((p) => p.label === presetLabel)?.days ?? 30;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    if (days > 0) since.setDate(since.getDate() - (days - 1));
    return since.toISOString();
  }, [presetLabel]);
  const { data: datos, isLoading: loading } = useDashboardQr(sinceIso);

  const { kpis, statusData, pdvData, evolucion } = useMemo(() => {
    if (!datos)
      return {
        kpis: [] as Kpi[],
        statusData: [] as { name: string; value: number }[],
        pdvData: [] as { name: string; value: number }[],
        evolucion: [] as { mes: string; cobros: number; monto: number }[],
      };
    const { cobros: lista, estados, pdvsPorEstado } = datos;

    const nombreEstado = (id: number | null) =>
      estados?.find((e) => e.id === id)?.nombre ?? "Desconocido";

    const total = lista.length;
    const montoTotal = lista.reduce((a, m) => a + Number(m.monto_operacion ?? 0), 0);
    const aprobados = lista.filter(
      (m) => nombreEstado(m.estado_id).toLowerCase() === "aprobado",
    ).length;
    const pendientes = total - aprobados;
    const tasa = total ? (aprobados / total) * 100 : 0;
    const pdvActivos = pdvsPorEstado["Activado"] ?? 0;

    // Estado de cobros (pie)
    const porEstado: Record<string, number> = {};
    for (const m of lista) {
      const n = nombreEstado(m.estado_id);
      porEstado[n] = (porEstado[n] ?? 0) + 1;
    }
    const statusArr = Object.entries(porEstado).map(([name, value]) => ({ name, value }));

    // Evolución por mes (últimos 6)
    const porMes: Record<string, { cobros: number; monto: number }> = {};
    for (const m of lista) {
      const key = (m.fecha ?? "").slice(0, 7);
      if (!key) continue;
      porMes[key] = porMes[key] ?? { cobros: 0, monto: 0 };
      porMes[key].cobros += 1;
      porMes[key].monto += Number(m.monto_operacion ?? 0);
    }
    const meses = Object.keys(porMes).sort().slice(-6);
    const evArr = meses.map((k) => {
      const [, mm] = k.split("-");
      return {
        mes: MESES[parseInt(mm, 10) - 1] ?? k,
        cobros: porMes[k].cobros,
        monto: +(porMes[k].monto / 1_000_000).toFixed(2),
      };
    });

    const pdvArr = Object.entries(pdvsPorEstado).map(([name, value]) => ({ name, value }));

    return {
      kpis: [
        { icon: QrCode, label: "Total cobros QR", value: total.toString() },
        {
          icon: DollarSign,
          label: "Monto total recaudado",
          value: `${formatMoney(montoTotal, { decimals: 0 })} ARS`,
        },
        { icon: Activity, label: "Transacciones", value: aprobados.toString() },
        { icon: TrendingUp, label: "Pendientes", value: pendientes.toString() },
        { icon: Store, label: "PDV activos", value: pdvActivos.toString() },
        { icon: TrendingUp, label: "Tasa de exito", value: tasa.toFixed(1) + "%" },
      ] as Kpi[],
      statusData: statusArr,
      pdvData: pdvArr,
      evolucion: evArr,
    };
  }, [datos]);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet([
      ...kpis.map((k) => ({ Metrica: k.label, Valor: k.value })),
      ...statusData.map((d) => ({ Metrica: "Estado " + d.name, Valor: d.value })),
      ...pdvData.map((d) => ({ Metrica: "PDV " + d.name, Valor: d.value })),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard QR");
    XLSX.writeFile(wb, "qr-dashboard-" + presetLabel + ".xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Dashboard - Cobros con QR", 14, 20);
    doc.text("Periodo: " + presetLabel, 14, 30);
    const body = kpis.map((k) => [k.label, k.value]);
    (doc as unknown as { autoTable: (opts: object) => void }).autoTable({
      startY: 38,
      head: [["Metrica", "Valor"]],
      body,
    });
    doc.save("qr-dashboard-" + presetLabel + ".pdf");
  };

  const statusColor = (name: string, i: number) =>
    STATUS_COLOR[name] ?? PALETTE[i % PALETTE.length];
  const pdvColor = (name: string) =>
    name === "Activado" ? "#22c55e" : name === "Desactivado" ? "#f59e0b" : PALETTE[2];

  return (
    <div>
      <PageHeader
        title="Cobros con QR"
        description="Cobra presencialmente con QR interoperables compatibles con cualquier billetera."
      />

      {/* Period filter + export */}
      <div className="flex flex-wrap gap-2 mb-6">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => setPresetLabel(p.label)}
            className={
              "px-4 py-2 rounded-lg text-xs font-semibold border transition " +
              (presetLabel === p.label
                ? "bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)] border-transparent"
                : "bg-card hover:bg-muted")
            }
          >
            {p.label}
          </button>
        ))}
        <div className="flex-1" />
        <BtnOutline className="h-9 px-3 text-xs" onClick={exportExcel}>
          <FileSpreadsheet size={14} /> Excel
        </BtnOutline>
        <BtnOutline className="h-9 px-3 text-xs" onClick={exportPDF}>
          <Download size={14} /> PDF
        </BtnOutline>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Cargando…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {kpis.map((k) => (
              <div key={k.label} className="bg-card border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <k.icon size={14} className="text-muted-foreground" />
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {k.label}
                  </div>
                </div>
                <div className="font-display tabular-nums text-sm md:text-base font-semibold">
                  {k.value}
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
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
                      label={({ name, value }: { name?: string; value?: number }) =>
                        name + " " + value
                      }
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
                      label={({ name, value }: { name?: string; value?: number }) =>
                        name + " " + value
                      }
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
        </>
      )}
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
