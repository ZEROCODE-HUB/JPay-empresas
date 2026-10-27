import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import type { DashboardQrCalculado } from "./utils";

export function exportarDashboardQrExcel(d: DashboardQrCalculado, presetLabel: string) {
  const ws = XLSX.utils.json_to_sheet([
    ...d.kpis.map((k) => ({ Metrica: k.label, Valor: k.value })),
    ...d.statusData.map((s) => ({ Metrica: "Estado " + s.name, Valor: s.value })),
    ...d.pdvData.map((s) => ({ Metrica: "PDV " + s.name, Valor: s.value })),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dashboard QR");
  XLSX.writeFile(wb, "qr-dashboard-" + presetLabel + ".xlsx");
}

export function exportarDashboardQrPdf(d: DashboardQrCalculado, presetLabel: string) {
  const doc = new jsPDF();
  doc.text("Dashboard - Cobros con QR", 14, 20);
  doc.text("Periodo: " + presetLabel, 14, 30);
  const body = d.kpis.map((k) => [k.label, k.value]);
  (doc as unknown as { autoTable: (opts: object) => void }).autoTable({
    startY: 38,
    head: [["Metrica", "Valor"]],
    body,
  });
  doc.save("qr-dashboard-" + presetLabel + ".pdf");
}
