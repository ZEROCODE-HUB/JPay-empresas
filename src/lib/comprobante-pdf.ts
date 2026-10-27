import jsPDF from "jspdf";
import {
  formatearMonto,
  formatearFechaComprobante,
  nombreArchivoComprobante,
  type DatosComprobante,
} from "./comprobante";

function soloDigitos(v: string): string {
  return v.replace(/\D/g, "") || "—";
}

/** Descargable con el mismo comprobante simple que se comparte como imagen. */
export function generarComprobantePdf(d: DatosComprobante): jsPDF {
  const doc = new jsPDF();
  const izquierda = 14;
  const derecha = 196;
  let y = 18;
  const linea = () => {
    doc.setDrawColor(229, 231, 235);
    doc.line(izquierda, y, derecha, y);
    y += 11;
  };
  const fila = (etiqueta: string, valor: string, mono = false) => {
    doc.setTextColor(34, 34, 34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(etiqueta, izquierda, y);
    doc.setFont(mono ? "courier" : "helvetica", mono ? "bold" : "normal");
    doc.text(valor || "—", derecha, y, { align: "right" });
    y += 8;
  };

  doc.setTextColor(34, 34, 34);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Enviaste dinero", izquierda, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(formatearFechaComprobante(d.fecha), derecha, y, { align: "right" });
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Monto de operación:", izquierda, y);
  doc.setTextColor(0, 119, 255);
  doc.text(formatearMonto(d.monto), derecha, y, { align: "right" });
  y += 10;
  linea();

  doc.setTextColor(34, 34, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Desde:", izquierda, y);
  y += 8;
  fila("Nombre:", d.desde.nombre);
  fila("CUIT:", soloDigitos(d.desde.cuit), true);
  fila("CBU/CVU:", d.desde.cbu || "—", true);
  linea();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Hacia:", izquierda, y);
  y += 8;
  fila("Nombre:", d.hacia.nombre);
  fila("CUIT:", soloDigitos(d.hacia.cuit), true);
  fila("CBU/CVU:", d.hacia.cbu || "—", true);
  if (d.hacia.banco) fila("Banco:", d.hacia.banco);
  linea();
  fila("Estado:", d.estado || "—");
  fila("ID de transacción:", d.txid, true);
  y += 9;
  linea();
  doc.setTextColor(107, 114, 128);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Comprobante no válido como factura", 105, y, { align: "center" });
  return doc;
}

export function descargarComprobantePdf(d: DatosComprobante): void {
  generarComprobantePdf(d).save(nombreArchivoComprobante(d, "pdf"));
}
