import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { brand } from "@/brand/brand";
import { resolveColor } from "@/brand/colors";
import type { ExportDiaRow } from "@/lib/api/calendario-acreditaciones";
import type { LiquidacionesDatos } from "@/lib/api/liquidaciones";
import { formatDate, formatMoney } from "@/shared/format";
import { ESTADO_TICKET_LABEL } from "./estados";

import { getPais } from "@/shared/pais";
type Resumen = Pick<
  LiquidacionesDatos,
  "faltaCobrar" | "porAcreditar" | "disponible" | "dias" | "tickets"
>;

const hoyISO = () => new Date().toISOString().slice(0, 10);

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

// ============================================================================
// Resumen de la pantalla (botones Excel / PDF del encabezado)
// ============================================================================

export function exportarResumenExcel(r: Resumen) {
  const ws = XLSX.utils.json_to_sheet([
    { Metrica: "Falta cobrar (por cobrar)", Valor: formatMoney(r.faltaCobrar) },
    { Metrica: `Por acreditar (${brand.name} te debe)`, Valor: formatMoney(r.porAcreditar) },
    { Metrica: "Disponible para adelanto", Valor: formatMoney(r.disponible) },
    {},
    ...r.dias.map((d) => ({
      Metrica: `Acredita ${formatDate(d.date)}`,
      Valor: formatMoney(d.monto),
      Cantidad: d.cantidad,
    })),
    {},
    ...r.tickets.map((t) => ({
      Ticket: t.id,
      Fecha: t.fecha,
      "Monto solicitado": formatMoney(t.montoSolicitado),
      "Fecha acreditación": formatDate(t.fechaAcreditacion),
      Estado: ESTADO_TICKET_LABEL[t.estado],
    })),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Liquidaciones");
  XLSX.writeFile(wb, `liquidaciones-${hoyISO()}.xlsx`);
}

export function exportarResumenPdf(r: Resumen) {
  const doc = new jsPDF();
  doc.setFillColor(...resolveColor("primary"));
  doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor(...resolveColor("on-primary"));
  doc.setFontSize(16);
  doc.text(brand.name, 14, 16);
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  doc.text(`Liquidaciones · ${new Date().toLocaleDateString(getPais().locale)}`, 196, 16, {
    align: "right",
  });
  autoTable(doc, {
    startY: 30,
    head: [["Concepto", "Monto"]],
    body: [
      ["Falta cobrar", formatMoney(r.faltaCobrar)],
      ["Por acreditar", formatMoney(r.porAcreditar)],
      ["Disponible adelanto", formatMoney(r.disponible)],
    ],
  });
  autoTable(doc, {
    startY: finalY(doc) + 8,
    head: [["Fecha acredita", "Monto", "Ops"]],
    body: r.dias.map((d) => [formatDate(d.date), formatMoney(d.monto), String(d.cantidad)]),
    styles: { fontSize: 8 },
  });
  autoTable(doc, {
    startY: finalY(doc) + 8,
    head: [["Ticket", "Fecha", "Monto solicitado", "Acredita", "Estado"]],
    body: r.tickets.map((t) => [
      t.id,
      t.fecha,
      formatMoney(t.montoSolicitado),
      formatDate(t.fechaAcreditacion),
      ESTADO_TICKET_LABEL[t.estado],
    ]),
    styles: { fontSize: 7 },
  });
  doc.save(`liquidaciones-${hoyISO()}.pdf`);
}

// ============================================================================
// Detalle de un día del calendario
// ============================================================================

const nombreArchivoDia = (titulo: string) => titulo.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);

export function exportarDiaExcel(titulo: string, rows: ExportDiaRow[]) {
  const wb = XLSX.utils.book_new();
  const data = rows.map((r) => ({
    Lote: r.codigo,
    Comercio: r.nombreComercio ?? "—",
    Legajo: r.legajo,
    Bandera: r.bandera,
    Estado: r.estado,
    Operaciones: r.cantidadOperaciones,
    "Importe bruto": r.importeBruto,
    [`Comisión ${brand.name}`]: r.tasaPropiaMonto,
    "Comisión PayWay": r.tasaPaywayMonto,
    "Comisión cierre lote": r.comisionCierreLoteMonto,
    Impuestos: r.impuestos,
    Contracargo: r.contracargoMonto,
    "Importe neto": r.importeNeto,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 30));
  XLSX.writeFile(wb, `calendario_${nombreArchivoDia(titulo)}.xlsx`);
}

export function exportarDiaPdf(titulo: string, rows: ExportDiaRow[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(`Calendario de Acreditaciones — ${titulo}`, 14, 16);
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString(getPais().locale)}`, 14, 22);
  autoTable(doc, {
    startY: 28,
    head: [
      [
        "Lote",
        "Comercio",
        "Bandera",
        "Estado",
        "Ops",
        "Bruto",
        brand.name,
        "PayWay",
        "Cierre",
        "Impuestos",
        "Contracargo",
        "Neto",
      ],
    ],
    body: rows.map((r) => [
      r.codigo,
      r.nombreComercio ?? "—",
      r.bandera,
      r.estado,
      String(r.cantidadOperaciones),
      formatMoney(r.importeBruto),
      formatMoney(r.tasaPropiaMonto),
      formatMoney(r.tasaPaywayMonto),
      formatMoney(r.comisionCierreLoteMonto),
      formatMoney(r.impuestos),
      formatMoney(r.contracargoMonto),
      formatMoney(r.importeNeto),
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [33, 37, 41] },
  });
  doc.save(`calendario_${nombreArchivoDia(titulo)}.pdf`);
}
