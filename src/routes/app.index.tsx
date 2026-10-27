import { createFileRoute } from "@tanstack/react-router";
import { resolveColor } from "@/brand/colors";
import { brand } from "@/brand/brand";
import { useMemo, useState } from "react";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  Link2,
  QrCode,
  Smartphone,
  Clock,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PageHeader, Card, BtnOutline } from "@/components/portal-shell";
import { toast } from "sonner";
import { useDashboard } from "@/hooks/useMovimientos";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { formatMoney } from "@/shared/format";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

type PeriodKey = "today" | "15d" | "30d" | "60d" | "90d" | "day" | "range";

const QUICK: Array<{ k: PeriodKey; l: string; days: number }> = [
  { k: "today", l: "Hoy", days: 1 },
  { k: "15d", l: "15 días", days: 15 },
  { k: "30d", l: "30 días", days: 30 },
  { k: "60d", l: "60 días", days: 60 },
  { k: "90d", l: "90 días", days: 90 },
];

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtKey(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  let guard = 0;
  while (s <= e && guard < 366) {
    out.push(new Date(s));
    s.setDate(s.getDate() + 1);
    guard++;
  }
  return out;
}

function Dashboard() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const range = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (period === "day") {
      const d = new Date(day + "T00:00:00");
      return {
        start: d,
        end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
      };
    }
    if (period === "range") {
      const s = desde ? new Date(desde + "T00:00:00") : today;
      const e = hasta
        ? new Date(hasta + "T23:59:59")
        : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      return { start: s, end: e };
    }
    const days = QUICK.find((p) => p.k === period)?.days ?? 30;
    const s = new Date(today);
    s.setDate(today.getDate() - (days - 1));
    const e = new Date(today);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }, [period, day, desde, hasta]);

  const { movs, saldoTotal, cuentas, cbuLabel } = useDashboard(range.start, range.end);

  const data = useMemo(() => {
    const dias = eachDay(range.start, range.end);
    const byDate = new Map<
      string,
      { date: string; depositos: number; cobrosQR: number; linkPago: number; total: number }
    >();
    dias.forEach((d) => {
      const key = toKey(d);
      byDate.set(key, { date: fmtKey(d), depositos: 0, cobrosQR: 0, linkPago: 0, total: 0 });
    });
    movs.forEach((m) => {
      const key = (m.fecha ?? "").slice(0, 10);
      const row = byDate.get(key);
      if (!row) return;
      const amt = Math.abs(Number(m.monto_operacion ?? 0));
      if (m.tipo === "deposito") row.depositos += amt;
      else if (m.tipo === "cobro_pct") row.cobrosQR += amt;
      else if (m.tipo === "tarjeta") row.linkPago += amt;
      row.total = row.depositos + row.cobrosQR + row.linkPago;
    });
    return Array.from(byDate.values());
  }, [movs, range.start, range.end]);

  const kpis = useMemo(() => {
    const sum = (t: string) =>
      movs
        .filter((x) => x.tipo === t)
        .reduce((a, x) => a + Math.abs(Number(x.monto_operacion ?? 0)), 0);
    const count = (t: string) => movs.filter((x) => x.tipo === t).length;
    return {
      saldo: saldoTotal,
      depositos: sum("deposito"),
      opsDep: count("deposito"),
      retiros: sum("retiro"),
      opsRet: count("retiro"),
      cuentas,
      cobrosLink: sum("tarjeta"),
      cobrosQR: sum("cobro_pct"),
      pagosQR: sum("pago_pct"),
    };
  }, [movs, saldoTotal, cuentas]);

  const doExport = (fmt: "xlsx" | "pdf") => {
    const rows = movs.map((m) => ({
      Fecha: (m.fecha ?? "").slice(0, 16).replace("T", " "),
      Tipo: m.tipo,
      Monto: Math.abs(Number(m.monto_operacion ?? 0)),
    }));
    if (fmt === "xlsx") {
      const ws = XLSX.utils.json_to_sheet([
        { Resumen: "Saldo total", Valor: formatMoney(kpis.saldo) },
        { Resumen: "Depósitos", Valor: formatMoney(kpis.depositos) },
        { Resumen: "Retiros", Valor: formatMoney(kpis.retiros) },
        { Resumen: "Cobros Link de Pago", Valor: formatMoney(kpis.cobrosLink) },
        { Resumen: "Cobros QR", Valor: formatMoney(kpis.cobrosQR) },
        { Resumen: "Pagos QR", Valor: formatMoney(kpis.pagosQR) },
        { Resumen: "Cuentas", Valor: String(kpis.cuentas) },
        {},
        ...rows,
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
      XLSX.writeFile(wb, `dashboard-movimientos-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Excel descargado");
    } else {
      const doc = new jsPDF();
      doc.setFillColor(...resolveColor("primary"));
      doc.rect(0, 0, 210, 24, "F");
      doc.setTextColor(...resolveColor("on-primary"));
      doc.setFontSize(16);
      doc.text(brand.name, 14, 16);
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(10);
      doc.text(`Dashboard · ${periodLabel}`, 196, 12, { align: "right" });
      doc.text(new Date().toLocaleString("es-AR"), 196, 18, { align: "right" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        startY: 32,
        head: [["KPI", "Valor"]],
        body: [
          ["Saldo total", formatMoney(kpis.saldo)],
          ["Depósitos", formatMoney(kpis.depositos)],
          ["Retiros", formatMoney(kpis.retiros)],
          ["Cobros Link de Pago", formatMoney(kpis.cobrosLink)],
          ["Cobros QR", formatMoney(kpis.cobrosQR)],
          ["Pagos QR", formatMoney(kpis.pagosQR)],
          ["Cuentas", String(kpis.cuentas)],
        ],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [["Fecha", "Tipo", "Monto"]],
        body: rows.map((r) => [r.Fecha, r.Tipo, r.Monto.toFixed(2)]),
        styles: { fontSize: 7 },
      });
      doc.save(`dashboard-movimientos-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF descargado");
    }
  };

  const periodLabel = useMemo(() => {
    if (period === "day") return day;
    if (period === "range") return `${desde || "?"} – ${hasta || "?"}`;
    return QUICK.find((p) => p.k === period)?.l ?? "30 días";
  }, [period, day, desde, hasta]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Panel ejecutivo — estado de tu operación financiera."
        action={
          <div className="hidden md:flex items-center gap-2 text-xs text-black-400">
            <Clock size={14} /> Datos en vivo
          </div>
        }
      />

      <Card className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-black-400 uppercase tracking-wide shrink-0">
            Período
          </span>
          {QUICK.map((p) => (
            <button
              key={p.k}
              onClick={() => setPeriod(p.k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                period === p.k
                  ? "bg-secondary-50 text-secondary-600 border-transparent"
                  : "bg-white hover:bg-black-50 border-black-100 text-black-500"
              }`}
            >
              {p.l}
            </button>
          ))}
          <button
            onClick={() => setPeriod("day")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              period === "day"
                ? "bg-secondary-50 text-secondary-600 border-transparent"
                : "bg-white hover:bg-black-50 border-black-100 text-black-500"
            }`}
          >
            Día específico
          </button>
          <button
            onClick={() => setPeriod("range")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              period === "range"
                ? "bg-secondary-50 text-secondary-600 border-transparent"
                : "bg-white hover:bg-black-50 border-black-100 text-black-500"
            }`}
          >
            Rango
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-black-400">Día</span>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="h-9 px-3 rounded-sm border border-black-100 bg-white text-sm text-black-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-black-400">Desde</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="h-9 px-3 rounded-sm border border-black-100 bg-white text-sm text-black-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-black-400">Hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              min={desde || undefined}
              className="h-9 px-3 rounded-sm border border-black-100 bg-white text-sm text-black-700"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <BtnOutline onClick={() => doExport("xlsx")}>
              <FileSpreadsheet size={14} /> Excel
            </BtnOutline>
            <BtnOutline onClick={() => doExport("pdf")}>
              <FileText size={14} /> PDF
            </BtnOutline>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-black-400 mb-1">Saldo total de la cuenta</div>
              <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-black-800">
                {formatMoney(kpis.saldo)}
              </div>
              <div className="text-xs text-black-400 mt-0.5">{cbuLabel || "Sin CVU asignada"}</div>
            </div>
            <div className="w-9 h-9 rounded-sm bg-secondary-50 flex items-center justify-center text-secondary-500 shrink-0">
              <Wallet size={18} />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-black-400 mb-1">Depósitos del período</div>
              <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-black-800">
                {formatMoney(kpis.depositos)}
              </div>
              <div className="text-xs text-black-400 mt-0.5">{kpis.opsDep} operaciones</div>
            </div>
            <div className="w-9 h-9 rounded-sm bg-success-bg flex items-center justify-center text-success shrink-0">
              <ArrowDownLeft size={18} />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-black-400 mb-1">Retiros del período</div>
              <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-black-800">
                {formatMoney(kpis.retiros)}
              </div>
              <div className="text-xs text-black-400 mt-0.5">{kpis.opsRet} operaciones</div>
            </div>
            <div className="w-9 h-9 rounded-sm bg-error-bg flex items-center justify-center text-error shrink-0">
              <ArrowUpRight size={18} />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-black-400 mb-1">Total de cuentas</div>
              <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-black-800">
                {kpis.cuentas}
              </div>
              <div className="text-xs text-black-400 mt-0.5">
                1 principal + {kpis.cuentas - 1} subcuentas
              </div>
            </div>
            <div className="w-9 h-9 rounded-sm bg-info-bg flex items-center justify-center text-info shrink-0">
              <Users size={18} />
            </div>
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-black-400 mb-1">Cobros mediante Link de Pago</div>
              <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-black-800">
                {formatMoney(kpis.cobrosLink)}
              </div>
              <div className="text-xs text-black-400 mt-0.5">
                {Math.round(kpis.cobrosLink / 85000)} transacciones
              </div>
            </div>
            <div className="w-9 h-9 rounded-sm bg-secondary-50 flex items-center justify-center text-secondary-500 shrink-0">
              <Link2 size={18} />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-black-400 mb-1">Cobros mediante Código QR</div>
              <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-black-800">
                {formatMoney(kpis.cobrosQR)}
              </div>
              <div className="text-xs text-black-400 mt-0.5">
                {Math.round(kpis.cobrosQR / 32000)} transacciones
              </div>
            </div>
            <div className="w-9 h-9 rounded-sm bg-warning-bg flex items-center justify-center text-warning shrink-0">
              <QrCode size={18} />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-black-400 mb-1">Pagos realizados mediante QR</div>
              <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-black-800">
                {formatMoney(kpis.pagosQR)}
              </div>
              <div className="text-xs text-black-400 mt-0.5">
                {Math.round(kpis.pagosQR / 18000)} transacciones
              </div>
            </div>
            <div className="w-9 h-9 rounded-sm bg-plata-200 flex items-center justify-center text-black-600 shrink-0">
              <Smartphone size={18} />
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-black-800 truncate">Movimientos diarios</h3>
            <p className="text-xs text-black-400 truncate">{periodLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary-500" /> Depósitos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-black" /> Cobros QR
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-secondary-500" /> Link de Pago
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-warning" /> Total del día
          </span>
        </div>
        <div className="w-full" style={{ height: Math.max(200, Math.min(360, 40 * data.length)) }}>
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
                barGap={2}
                barCategoryGap={data.length > 30 ? 4 : 8}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#D4D4D4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#909090" }}
                  tickLine={false}
                  axisLine={{ stroke: "#D4D4D4" }}
                  interval={data.length > 30 ? Math.floor(data.length / 10) : 0}
                />
                <YAxis
                  tickFormatter={(v: number) => `$${(v / 1_000_000).toFixed(1)}M`}
                  tick={{ fontSize: 10, fill: "#909090" }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      depositos: "Depósitos",
                      cobrosQR: "Cobros QR",
                      linkPago: "Link de Pago",
                      total: "Total del día",
                    };
                    return [formatMoney(value), labels[name] || name];
                  }}
                  labelFormatter={(label: string) => `Fecha: ${label}`}
                  contentStyle={{
                    borderRadius: 4,
                    border: "1px solid #D4D4D4",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="depositos"
                  fill="var(--brand-primary-500)"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={32}
                />
                <Bar dataKey="cobrosQR" fill="#000000" radius={[2, 2, 0, 0]} maxBarSize={32} />
                <Bar
                  dataKey="linkPago"
                  fill="var(--brand-secondary-500)"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={32}
                />
                <Bar dataKey="total" fill="var(--warning)" radius={[2, 2, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-black-400">
              No hay movimientos para el período seleccionado.
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
