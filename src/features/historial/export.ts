import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { brand } from "@/brand/brand";
import { resolveColor } from "@/brand/colors";
import { formatMoney } from "@/shared/format";
import {
  formatFechaLinea,
  labelTipoLinea,
  prettyTipo,
  type Linea,
  type TotalesHistorial,
} from "./utils";

const nombreArchivo = (ext: string) =>
  `historial-movimientos-${new Date().toISOString().slice(0, 10)}.${ext}`;

/** Excel de las lineas filtradas: resumen arriba y una fila por linea. */
export function exportarHistorialExcel(lineas: Linea[], t: TotalesHistorial) {
  const body = lineas.map((l) => ({
    Legajo: l.legajo,
    TXID: l.idTxn,
    Tipo: labelTipoLinea(l.tipoLinea),
    Operacion: prettyTipo(l.tipoOperacion),
    CVU: l.cvu ?? "",
    Email: l.email ?? "",
    Nombre: l.nombre ?? "",
    Nombre_destino: l.nombreDestino ?? "",
    CUIT: l.cuit ?? "",
    Monto: l.monto,
    Fecha: formatFechaLinea(l.fecha),
    Estado: l.estado,
  }));
  const ws = XLSX.utils.json_to_sheet([
    { Resumen: "Ingresos", Valor: formatMoney(t.totalIngresos) },
    { Resumen: "Egresos", Valor: formatMoney(t.totalEgresos) },
    { Resumen: "Neto", Valor: formatMoney(t.totalIngresos - t.totalEgresos) },
    { Resumen: "Pendientes/Rechazados", Valor: String(t.totalPendientes) },
    {},
    ...body,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
  XLSX.writeFile(wb, nombreArchivo("xlsx"));
}

/** PDF de las lineas filtradas con el encabezado de marca y el numero de serie. */
export function exportarHistorialPdf(lineas: Linea[], t: TotalesHistorial, serie: string) {
  const doc = new jsPDF();
  doc.setFillColor(...resolveColor("primary"));
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(...resolveColor("on-primary"));
  doc.setFontSize(16);
  doc.text(brand.name, 14, 17);
  doc.setFontSize(9);
  doc.text("Reporte de movimientos", 14, 23);
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString("es-AR")}`, 196, 17, { align: "right" });
  doc.text(serie, 196, 23, { align: "right" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY: 34,
    head: [["Ingresos", "Egresos", "Neto", "Pendientes/Rechazados"]],
    body: [
      [
        formatMoney(t.totalIngresos),
        formatMoney(t.totalEgresos),
        formatMoney(t.totalIngresos - t.totalEgresos),
        String(t.totalPendientes),
      ],
    ],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY: 52,
    head: [["TXID", "Fecha", "Tipo", "Operacion", "Nombre destino", "CUIT", "Monto", "Estado"]],
    body: lineas.map((l) => [
      l.idTxn,
      formatFechaLinea(l.fecha),
      labelTipoLinea(l.tipoLinea),
      prettyTipo(l.tipoOperacion),
      l.nombreDestino ?? "-",
      l.cuit ?? "-",
      l.monto.toFixed(2),
      l.estado,
    ]),
    styles: { fontSize: 7 },
  });
  doc.save(nombreArchivo("pdf"));
}
