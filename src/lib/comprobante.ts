/**
 * Comprobante de una transferencia enviada.
 *
 * Aquí viven los datos y los formatos comunes; el PDF (`comprobante-pdf.ts`) y la imagen
 * (`comprobante-imagen.ts`) muestran los mismos campos.
 */
import { formatMoney } from "@/shared/format";

export type DatosComprobante = {
  /** ISO. */
  fecha: string;
  monto: number;
  concepto?: string;
  comision?: number;
  impuesto?: number;
  estado?: string;
  txid: string;
  desde: { nombre: string; rfc: string; clabe: string };
  hacia: {
    nombre: string;
    rfc: string;
    clabe: string;
    banco?: string;
    alias?: string;
    tipoCuenta?: string;
  };
};

/** Monto con el formato de la moneda del país (siempre positivo). */
export function formatearMonto(n: number): string {
  return formatMoney(Number.isFinite(n) ? Math.abs(n) : 0);
}

/** ISO → `2026-10-16 10:53:14` (hora local del navegador). */
export function formatearFechaComprobante(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** RFC o CLABE sin espacios ni guiones y en mayúsculas. */
export function limpiarIdentificador(v?: string | null): string {
  return (v ?? "").replace(/[\s-]/g, "").toUpperCase();
}

/** Nombre del archivo a descargar, ej. `comprobante-<TXID>.pdf`. */
export function nombreArchivoComprobante(d: DatosComprobante, ext: "pdf" | "txt" | "png"): string {
  const id = (d.txid || "transferencia").replace(/[^a-zA-Z0-9-]/g, "");
  return `comprobante-${id}.${ext}`;
}
