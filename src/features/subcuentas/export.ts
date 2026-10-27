import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { toast } from "sonner";
import { brand } from "@/brand/brand";
import { resolveColor } from "@/brand/colors";
import type { Mov, Sub } from "./types";

/** Copia el CVU al portapapeles y avisa con un toast. */
export const copiarCvu = async (cvu: string) => {
  if (!cvu) {
    toast.error("La subcuenta no tiene CVU asignado");
    return;
  }
  try {
    await navigator.clipboard.writeText(cvu);
    toast.success("CVU copiado");
  } catch {
    toast.error("No se pudo copiar el CVU");
  }
};

/** Descarga el reporte de movimientos de la subcuenta en Excel o PDF. */
export function descargarReporteSubcuenta(sub: Sub, moves: Mov[], formato: "excel" | "pdf") {
  const nombre = (sub.n || sub.cbu || "subcuenta").replace(/\s+/g, "_");
  if (formato === "excel") {
    const ws = XLSX.utils.json_to_sheet([
      { Subcuenta: sub.n, CVU: sub.cbu, Estado: sub.e, Tipo: sub.tipo, Email: sub.email },
      {},
      ...moves.map((m) => ({
        Fecha: m.fecha,
        Hora: m.hora,
        Tipo: m.tipo === "ingreso" ? "Ingreso" : "Egreso",
        Concepto: m.titulo,
        TXID: m.txid,
        "CVU contraparte": m.cbu,
        Monto: m.monto,
      })),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `subcuenta-${nombre}.xlsx`);
    toast.success("Reporte Excel descargado");
  } else {
    const doc = new jsPDF();
    doc.setFillColor(...resolveColor("primary"));
    doc.rect(0, 0, 210, 22, "F");
    doc.setTextColor(...resolveColor("on-primary"));
    doc.setFontSize(14);
    doc.text(brand.name, 14, 15);
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(10);
    doc.text(`Subcuenta: ${sub.n || sub.cbu}`, 14, 32);
    doc.text(`Estado: ${sub.e} · CVU: ${sub.cbu}`, 14, 38);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      startY: 44,
      head: [["Fecha", "Hora", "Tipo", "Concepto", "TXID", "Monto"]],
      body: moves.map((m) => [
        m.fecha,
        m.hora,
        m.tipo === "ingreso" ? "Ingreso" : "Egreso",
        m.titulo,
        m.txid,
        m.monto.toFixed(2),
      ]),
      styles: { fontSize: 7 },
    });
    doc.save(`subcuenta-${nombre}.pdf`);
    toast.success("Reporte PDF descargado");
  }
}
