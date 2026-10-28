/**
 * Exportación del reporte de cobros (Excel con una hoja por corte y PDF con el resumen).
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 */
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { brand } from "@/brand/brand";
import { resolveColor } from "@/brand/colors";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "./format";
import { getPais } from "./pais";
import {
  etiquetaMetodo,
  etiquetaPunto,
  filasDetalleCobros,
  type ReporteCobros,
} from "./reporte-cobros";

const nombreArchivo = (r: ReporteCobros, ext: string) =>
  `reporte-cobros-${r.desde}-a-${r.hasta}.${ext}`;

function filasResumen(r: ReporteCobros) {
  const s = r.resumen;
  return [
    { Concepto: "Período", Valor: `${formatDate(r.desde)} al ${formatDate(r.hasta)}` },
    { Concepto: "Cobros", Valor: s.cantidad },
    { Concepto: "Cobrado", Valor: s.cobrado },
    { Concepto: "Comisión del proveedor", Valor: s.comision },
    { Concepto: "Neto", Valor: s.neto },
    { Concepto: "Reembolsado", Valor: s.reembolsado },
    { Concepto: "Contracargos", Valor: s.contracargos },
    { Concepto: "Monto en contracargos", Valor: s.contracargosMonto },
    { Concepto: "Pendientes de pago", Valor: s.pendientes },
    { Concepto: "Cobros sin conciliar", Valor: s.sinConciliar },
  ];
}

/** Excel con hojas Resumen, Por día, Por medio, Por punto, (Por comercio) y Detalle. */
export function exportarReporteCobrosExcel(r: ReporteCobros, conComercio = false) {
  const wb = XLSX.utils.book_new();
  const hoja = (nombre: string, filas: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), nombre);

  hoja("Resumen", filasResumen(r));
  hoja(
    "Por día",
    r.porDia.map((d) => ({
      Fecha: formatDate(d.fecha),
      Cobros: d.cantidad,
      Monto: d.monto,
      Comision: d.comision,
      Reembolsado: d.reembolsado,
    })),
  );
  hoja(
    "Por medio",
    r.porMetodo.map((m) => ({
      Medio: etiquetaMetodo(m.metodo),
      Cobros: m.cantidad,
      Monto: m.monto,
      Comision: m.comision,
      Reembolsado: m.reembolsado,
    })),
  );
  hoja(
    "Por punto",
    r.porSucursal.map((p) => ({
      Punto: etiquetaPunto(p.sucursal, p.caja),
      Cobros: p.cantidad,
      Monto: p.monto,
      Comision: p.comision,
    })),
  );
  if (conComercio) {
    hoja(
      "Por comercio",
      r.porComercio.map((c) => ({
        Comercio: c.comercio ?? "",
        Cobros: c.cantidad,
        Monto: c.monto,
        Comision: c.comision,
        Neto: c.neto,
        Reembolsado: c.reembolsado,
      })),
    );
  }
  hoja("Detalle", filasDetalleCobros(r.detalle, formatDateTime, conComercio));
  XLSX.writeFile(wb, nombreArchivo(r, "xlsx"));
}

/** PDF con el encabezado de marca, el resumen y los cortes por medio, punto y comercio. */
export function exportarReporteCobrosPdf(r: ReporteCobros, conComercio = false) {
  const doc = new jsPDF();
  doc.setFillColor(...resolveColor("primary"));
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(...resolveColor("on-primary"));
  doc.setFontSize(16);
  doc.text(brand.name, 14, 17);
  doc.setFontSize(9);
  doc.text(`Reporte de cobros · ${formatDate(r.desde)} al ${formatDate(r.hasta)}`, 14, 23);
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString(getPais().locale)}`, 196, 17, {
    align: "right",
  });

  const s = r.resumen;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tabla = (opts: Record<string, unknown>) => (doc as any).autoTable(opts);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const siguiente = () => ((doc as any).lastAutoTable?.finalY ?? 30) + 8;

  tabla({
    startY: 34,
    head: [["Cobros", "Cobrado", "Comisión", "Neto", "Reembolsado", "Contracargos"]],
    body: [
      [
        formatNumber(s.cantidad),
        formatMoney(s.cobrado),
        formatMoney(s.comision),
        formatMoney(s.neto),
        formatMoney(s.reembolsado),
        formatNumber(s.contracargos),
      ],
    ],
  });
  tabla({
    startY: siguiente(),
    head: [["Medio", "Cobros", "Monto", "Comisión", "Reembolsado"]],
    body: r.porMetodo.map((m) => [
      etiquetaMetodo(m.metodo),
      formatNumber(m.cantidad),
      formatMoney(m.monto),
      formatMoney(m.comision),
      formatMoney(m.reembolsado),
    ]),
  });
  tabla({
    startY: siguiente(),
    head: [["Punto de cobro", "Cobros", "Monto", "Comisión"]],
    body: r.porSucursal.map((p) => [
      etiquetaPunto(p.sucursal, p.caja),
      formatNumber(p.cantidad),
      formatMoney(p.monto),
      formatMoney(p.comision),
    ]),
  });
  if (conComercio) {
    tabla({
      startY: siguiente(),
      head: [["Comercio", "Cobros", "Monto", "Comisión", "Neto"]],
      body: r.porComercio.map((c) => [
        c.comercio ?? "—",
        formatNumber(c.cantidad),
        formatMoney(c.monto),
        formatMoney(c.comision),
        formatMoney(c.neto),
      ]),
    });
  }
  tabla({
    startY: siguiente(),
    head: [["Fecha", "Cobros", "Monto", "Comisión", "Reembolsado"]],
    body: r.porDia
      .filter((d) => d.cantidad > 0 || d.reembolsado > 0)
      .map((d) => [
        formatDate(d.fecha),
        formatNumber(d.cantidad),
        formatMoney(d.monto),
        formatMoney(d.comision),
        formatMoney(d.reembolsado),
      ]),
  });
  doc.save(nombreArchivo(r, "pdf"));
}
