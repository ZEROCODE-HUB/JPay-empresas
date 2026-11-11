import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import { toast } from "sonner";
import { brand } from "@/brand/brand";
import { resolveColor } from "@/brand/colors";
import { formatMoney } from "@/shared/format";
import type { FilaDia, KpisDashboard } from "./utils";

import { getPais } from "@/shared/pais";

// jspdf-autotable 5 ya no se engancha solo a jsPDF: sin esto `doc.autoTable` no existe.
applyPlugin(jsPDF);
/** Filas de resumen (las mismas cifras que las tarjetas del Inicio). */
function resumen(kpis: KpisDashboard): [string, string][] {
  return [
    ["Saldo total (pesos)", formatMoney(kpis.saldo)],
    ...(kpis.hayUsd
      ? ([["Saldo en dólares", formatMoney(kpis.saldoUsd, { moneda: "USD" })]] as [
          string,
          string,
        ][])
      : []),
    ["Depósitos", formatMoney(kpis.depositos)],
    ["Salidas", formatMoney(kpis.salidas)],
    ["Comisiones e IVA", formatMoney(kpis.comisiones)],
    [
      kpis.tarjetaPruebas ? "Cobros con tarjeta (de prueba)" : "Cobros con tarjeta",
      formatMoney(kpis.cobrosLink),
    ],
    ["Cuentas", String(kpis.cuentas)],
  ];
}

/** Exporta los KPIs y los totales por día del período a Excel o PDF. */
export function exportarDashboard(
  fmt: "xlsx" | "pdf",
  filas: FilaDia[],
  kpis: KpisDashboard,
  periodLabel: string,
) {
  const rows = filas.map((f) => ({
    Fecha: f.date,
    Depósitos: f.depositos,
    "Cobros con tarjeta": f.linkPago,
    Total: f.total,
  }));
  if (fmt === "xlsx") {
    const ws = XLSX.utils.json_to_sheet([
      ...resumen(kpis).map(([Resumen, Valor]) => ({ Resumen, Valor })),
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
    doc.text(new Date().toLocaleString(getPais().locale), 196, 18, { align: "right" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      startY: 32,
      head: [["KPI", "Valor"]],
      body: resumen(kpis),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Fecha", "Depósitos", "Cobros con tarjeta", "Total"]],
      body: rows.map((r) => [
        r.Fecha,
        formatMoney(r.Depósitos),
        formatMoney(r["Cobros con tarjeta"]),
        formatMoney(r.Total),
      ]),
      styles: { fontSize: 7 },
    });
    doc.save(`dashboard-movimientos-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF descargado");
  }
}
