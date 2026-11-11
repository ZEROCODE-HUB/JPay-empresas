import { useState, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Download, FileSpreadsheet } from "lucide-react";
import { Card, BtnOutline } from "@/components/portal-shell";
import { formatMoney, monedaActiva } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import { useClienteActual, useDashboardLinksPago } from "@/hooks/useLinksPago";
import { brand } from "@/brand/brand";
import { Cargando, ErrorCarga } from "@/shared/ui/estado-carga";

const presets = [
  { label: "Hoy", days: 0 },
  { label: "15 días", days: 15 },
  { label: "30 días", days: 30 },
  { label: "60 días", days: 60 },
  { label: "90 días", days: 90 },
];

const COLORS: Record<string, string> = {
  Aprobado: "#22c55e",
  Pendiente: "#f59e0b",
  Rechazado: "#ef4444",
  Reembolsado: "#a855f7",
};
const METHOD_COLORS = [
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

/** Resumen de cobros con links de pago: KPIs, gráficos y exportación (Links de pago y Reportes). */
export function LinksPagoResumen() {
  const [days, setDays] = useState(30);
  const clienteQ = useClienteActual();
  const cliente = clienteQ.data;
  const dashQ = useDashboardLinksPago(cliente?.legajo, days);
  const { data } = dashQ;
  const error = data ? null : (clienteQ.error ?? dashQ.error);
  const cargando = !data && !error;
  const movs = useMemo(() => data?.movs ?? [], [data]);
  const links = data?.links ?? [];

  const metrics = useMemo(() => {
    const total = movs.length;
    const aprobados = movs.filter((x) => x.estado === "Aprobado");
    const totalApproved = aprobados.reduce((a, x) => a + x.monto, 0);
    const pending = movs.filter((x) => x.estado === "Pendiente").length;
    const rejected = movs.filter((x) => x.estado === "Rechazado").length;
    const refunds = movs.filter((x) => x.estado === "Reembolsado").length;
    return {
      totalApproved,
      totalTx: total,
      pending,
      rejected,
      refunds,
      conversionRate: total > 0 ? Math.round((aprobados.length / total) * 100) : 0,
      avgTicket: aprobados.length > 0 ? Math.round(totalApproved / aprobados.length) : 0,
    };
  }, [movs]);

  const statusData = [
    { name: "Aprobado", value: movs.filter((x) => x.estado === "Aprobado").length },
    { name: "Pendiente", value: metrics.pending },
    { name: "Rechazado", value: metrics.rejected },
    { name: "Reembolsado", value: metrics.refunds },
  ];

  const linkData = links.map((l) => ({
    name: (l.url ?? "").split("/").pop() || String(l.id).slice(0, 8).toUpperCase(),
    amount: Number(l.monto ?? 0),
  }));
  const volData = linkData.map((d) => ({ ...d, vol: +(d.amount / 1_000_000).toFixed(1) }));

  const kpis = [
    {
      label: "Total aprobado",
      value: formatMoney(metrics.totalApproved, { decimals: 0 }),
      info: `Suma de los cobros con tarjeta de tus links de pago aprobados en el período elegido, según tu cuenta ${brand.name}.`,
    },
    {
      label: "Transacciones totales",
      value: metrics.totalTx.toString(),
      info: "Cantidad de cobros con tarjeta de tus links de pago en el período, en cualquier estado.",
    },
    {
      label: "Pendientes",
      value: metrics.pending.toString(),
      info: "Cobros del período que todavía no se confirman (creados, abiertos o en proceso).",
    },
    {
      label: "Rechazadas",
      value: metrics.rejected.toString(),
      info: "Cobros del período rechazados, bloqueados o que expiraron sin pagarse.",
    },
    {
      label: "Reembolsos",
      value: metrics.refunds.toString(),
      info: "Cobros del período que hoy están reembolsados.",
    },
    {
      label: "Tasa de conversión",
      value: metrics.conversionRate + "%",
      info: "Porcentaje de cobros aprobados sobre el total de cobros del período.",
    },
    {
      label: "Ticket promedio",
      value: formatMoney(metrics.avgTicket, { decimals: 0 }),
      info: "Total aprobado dividido entre la cantidad de cobros aprobados del período.",
    },
  ];

  const label = presets.find((p) => p.days === days)?.label ?? `${days} días`;

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet([
      { Métrica: "Total aprobado", Valor: formatMoney(metrics.totalApproved) },
      { Métrica: "Transacciones totales", Valor: metrics.totalTx },
      { Métrica: "Pendientes", Valor: metrics.pending },
      { Métrica: "Rechazadas", Valor: metrics.rejected },
      { Métrica: "Reembolsos", Valor: metrics.refunds },
      { Métrica: "Tasa de conversión", Valor: metrics.conversionRate + "%" },
      { Métrica: "Ticket promedio", Valor: formatMoney(metrics.avgTicket) },
      ...linkData.map((d) => ({ Métrica: "Monto " + d.name, Valor: formatMoney(d.amount) })),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
    XLSX.writeFile(wb, "links-pago-dashboard-" + label + ".xlsx");
  };

  const exportPDF = () => {
    // jspdf-autotable 5 ya no se engancha solo a jsPDF: sin esto `doc.autoTable` no existe.
    // Se engancha al exportar (no al cargar el módulo) para que el render en el servidor no falle.
    applyPlugin(jsPDF);
    const doc = new jsPDF();
    doc.text("Resumen - Links de pago", 14, 20);
    doc.text("Período: " + label, 14, 30);
    const body = kpis.map((k) => [k.label, k.value]);
    (doc as any).autoTable({ startY: 38, head: [["Métrica", "Valor"]], body });
    doc.save("links-pago-dashboard-" + label + ".pdf");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {presets.map((p) => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className={
              "px-4 py-2 rounded-lg text-xs font-semibold border transition " +
              (days === p.days
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {kpis.map((k, i) => (
          <div key={k.label} className="bg-card border rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {k.label}
              {/* Las impares quedan a la derecha en el celular; las dos últimas, en escritorio. */}
              <InfoTip align={i % 2 === 1 || i >= 5 ? "right" : "left"} className="ml-1">
                {k.info}
              </InfoTip>
            </div>
            <div className="font-display tabular-nums text-sm md:text-base font-semibold mt-0.5">
              {cargando ? <Cargando className="h-5 w-16" /> : k.value}
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <ErrorCarga
          error={error}
          onRetry={() => void (clienteQ.error ? clienteQ.refetch() : dashQ.refetch())}
        />
      ) : cargando ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
          {[0, 1, 2].map((i) => (
            <Cargando key={i} className="block h-72 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
          <Card>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Estado de transacciones
              <InfoTip className="ml-1">
                Cantidad de cobros con tarjeta de tus links de pago en el período, agrupados por
                estado.
              </InfoTip>
            </h4>
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
                  {statusData.map((e) => (
                    <Cell key={e.name} fill={COLORS[e.name] || "#666"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Montos por link de pago
              <InfoTip className="ml-1">
                El monto configurado en cada uno de tus links de pago. No es lo cobrado y no depende
                del período elegido.
              </InfoTip>
            </h4>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={linkData}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name }: { name?: string }) => name}
                >
                  {linkData.map((_, i) => (
                    <Cell key={i} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatMoney(v, { decimals: 0 })} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="md:col-span-2 xl:col-span-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Volumen por link (millones {monedaActiva()})
              <InfoTip align="right" className="ml-1">
                El mismo monto configurado de cada link, en millones. No es lo cobrado y no depende
                del período elegido.
              </InfoTip>
            </h4>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={volData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => v + "M"} />
                <Bar dataKey="vol" radius={[4, 4, 0, 0]}>
                  {volData.map((_, i) => (
                    <Cell key={i} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </div>
  );
}
