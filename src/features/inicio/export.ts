import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { toast } from "sonner";
import { brand } from "@/brand/brand";
import { resolveColor } from "@/brand/colors";
import type { MovimientoDashboard } from "@/lib/api/movimientos";
import { formatMoney } from "@/shared/format";
import type { KpisDashboard } from "./utils";

import { getPais } from "@/shared/pais";
/** Exporta los KPIs y los movimientos del período a Excel o PDF. */
export function exportarDashboard(
  fmt: "xlsx" | "pdf",
  movs: MovimientoDashboard[],
  kpis: KpisDashboard,
  periodLabel: string,
) {
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
    doc.text(new Date().toLocaleString(getPais().locale), 196, 18, { align: "right" });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Fecha", "Tipo", "Monto"]],
      body: rows.map((r) => [r.Fecha, r.Tipo, r.Monto.toFixed(2)]),
      styles: { fontSize: 7 },
    });
    doc.save(`dashboard-movimientos-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF descargado");
  }
}
