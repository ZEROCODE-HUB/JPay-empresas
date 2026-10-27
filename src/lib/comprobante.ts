/**
 * Comprobante de una transferencia enviada.
 *
 * Acá vive el TEXTO del comprobante (una sola fuente de verdad) y las acciones
 * de compartir. El PDF (`comprobante-pdf.ts`) reusa este mismo texto, así lo que
 * se descarga y lo que se comparte dicen siempre lo mismo.
 */

export type DatosComprobante = {
  /** ISO. */
  fecha: string;
  monto: number;
  concepto?: string;
  comision?: number;
  impuesto?: number;
  estado?: string;
  txid: string;
  desde: { nombre: string; cuit: string; cbu: string };
  hacia: {
    nombre: string;
    cuit: string;
    cbu: string;
    banco?: string;
    alias?: string;
    tipoCuenta?: string;
  };
};

/** `1234.5` → `$ 1.234,50` (formato es-AR, sin depender del ICU del runtime). */
export function formatearMonto(n: number): string {
  const valor = Number.isFinite(n) ? Math.abs(n) : 0;
  const [ent, dec] = valor.toFixed(2).split(".");
  const conMiles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${conMiles},${dec}`;
}

/** ISO → `2026-10-16 10:53:14` (hora local del navegador). */
export function formatearFechaComprobante(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Solo dígitos (los comprobantes van sin guiones). */
function soloDigitos(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Texto del comprobante, con el mismo formato que se le muestra al cliente. */
export function formatearComprobanteTexto(d: DatosComprobante): string {
  const lineas: string[] = [];

  lineas.push("Enviaste dinero");
  const fecha = formatearFechaComprobante(d.fecha);
  if (fecha) lineas.push(fecha);
  lineas.push("");
  lineas.push(`Monto de operación: ${formatearMonto(d.monto)}`);
  lineas.push("");

  lineas.push("Desde:");
  lineas.push(`Nombre: ${d.desde.nombre || "—"}`);
  lineas.push(`CUIT: ${soloDigitos(d.desde.cuit) || "—"}`);
  lineas.push(`CBU/CVU: ${d.desde.cbu || "—"}`);
  lineas.push("");

  lineas.push("Hacia:");
  lineas.push(`Nombre: ${d.hacia.nombre || "—"}`);
  lineas.push(`CUIT: ${soloDigitos(d.hacia.cuit) || "—"}`);
  lineas.push(`CBU/CVU: ${d.hacia.cbu || "—"}`);
  if (d.hacia.banco) lineas.push(`Banco: ${d.hacia.banco}`);
  lineas.push("");

  // El comprobante compartido es breve y consistente: muestra solamente los
  // datos bancarios principales de la operación.
  lineas.push(`Estado: ${d.estado || "—"}`);
  lineas.push(`ID de transacción: ${d.txid}`);
  lineas.push("");
  lineas.push("Comprobante no válido como factura");

  return lineas.join("\n");
}

/** Nombre del archivo a descargar, ej. `comprobante-<TXID>.pdf`. */
export function nombreArchivoComprobante(d: DatosComprobante, ext: "pdf" | "txt" | "png"): string {
  const id = (d.txid || "transferencia").replace(/[^a-zA-Z0-9-]/g, "");
  return `comprobante-${id}.${ext}`;
}
