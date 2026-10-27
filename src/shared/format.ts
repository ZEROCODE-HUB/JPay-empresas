/**
 * Formato de números, montos, porcentajes, fechas e identificadores para toda la UI, según el
 * país activo (`@/shared/pais`): "$1,234.50" en México, "$ 1.234,50" en Argentina.
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 * Los valores vacíos (null, undefined, NaN, fecha inválida) se muestran como "—".
 */

import { getPais } from "./pais";

export const VACIO = "—";

type Numero = number | null | undefined;
type Fecha = string | Date | null | undefined;

const esNumero = (n: Numero): n is number => typeof n === "number" && Number.isFinite(n);

/** 1234.5 → "1,234.5" (MX) / "1.234,5" (AR) (decimales fijos: `decimals`). */
export function formatNumber(n: Numero, decimals = 0): string {
  if (!esNumero(n)) return VACIO;
  return n.toLocaleString(getPais().locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 1234.5 → "$1,234.50" (MX) / "$ 1.234,50" (AR); negativos "-$…". `signo` agrega "+" a los positivos. */
export function formatMoney(n: Numero, opts: { decimals?: number; signo?: boolean } = {}): string {
  if (!esNumero(n)) return VACIO;
  const { decimals = 2, signo = false } = opts;
  const { simboloMoneda, espacioMoneda } = getPais();
  const prefijo = n < 0 ? "-" : signo && n > 0 ? "+" : "";
  return `${prefijo}${simboloMoneda}${espacioMoneda ? " " : ""}${formatNumber(Math.abs(n), decimals)}`;
}

/** Código ISO de la moneda del país activo ("MXN", "ARS"), para columnas y exportaciones. */
export function monedaActiva(): string {
  return getPais().moneda;
}

/**
 * Monto tipeado por el usuario → número (NaN si no es un número). Acepta el formato del país
 * activo ("1,234.50" en México, "1.234,50" en Argentina), sin separadores ("1234.5") y con "$".
 * Con un solo tipo de separador: si agrupa de a 3 dígitos son miles ("1,500" / "1.500"); si
 * aparece una vez es el decimal ("1500,5" / "1500.5").
 */
export function parseMonto(texto: string | null | undefined): number {
  const t = (texto ?? "").replace(/[\s$]/g, "").replace(/^(-?)[A-Z]{3}/i, "$1");
  if (!t) return NaN;
  const dec = (1.5).toLocaleString(getPais().locale).charAt(1) === "," ? "," : ".";
  const miles = dec === "," ? "." : ",";
  // "1,234,567" / "1.234.567": de 1 a 3 dígitos y grupos de 3 separados por `miles`.
  const agrupaMiles = (s: string) =>
    s.split(miles).every((g, i) => (i === 0 ? /^-?\d{1,3}$/ : /^\d{3}$/).test(g));
  let normal: string;
  if (t.includes(dec) && t.includes(miles)) {
    const [entero, decimales, ...resto] = t.split(dec);
    if (resto.length || !agrupaMiles(entero)) return NaN;
    normal = `${entero.split(miles).join("")}.${decimales}`;
  } else if (t.includes(miles) && agrupaMiles(t)) {
    normal = t.split(miles).join("");
  } else {
    const sep = t.includes(dec) ? dec : miles;
    const partes = t.split(sep);
    if (partes.length > 2) return NaN;
    normal = partes.join(".");
  }
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}

/** 3.5 → "3.5%" (MX) / "3,5%" (AR) (hasta `maxDecimals` decimales, sin ceros de relleno). El valor ya viene en %. */
export function formatPercent(n: Numero, maxDecimals = 2): string {
  if (!esNumero(n)) return VACIO;
  return `${n.toLocaleString(getPais().locale, { maximumFractionDigits: maxDecimals })}%`;
}

/**
 * Convierte a Date. Las fechas sin hora ("2026-03-01") se toman en hora local: `new Date()`
 * las interpreta como UTC y en América se mostrarían como el día anterior.
 */
export function toDate(v: Fecha): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "dd/mm/aaaa". */
export function formatDate(v: Fecha): string {
  const d = toDate(v);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : VACIO;
}

/** "dd/mm". */
export function formatDateShort(v: Fecha): string {
  const d = toDate(v);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : VACIO;
}

/** "dd/mm/aaaa hh:mm" (24 h). */
export function formatDateTime(v: Fecha): string {
  const d = toDate(v);
  return d ? `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : VACIO;
}

/** "hh:mm" (24 h). */
export function formatTime(v: Fecha): string {
  const d = toDate(v);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : VACIO;
}

/** "20123456789" → "20-12345678-9". Si no tiene 11 dígitos se devuelve tal cual. */
export function formatCuit(cuit: string | null | undefined): string {
  if (!cuit) return VACIO;
  const d = cuit.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit;
}

/**
 * Identificador fiscal para mostrar: CUIT con guiones, RFC/CURP/CLABE en mayúsculas y sin
 * espacios. `tipo` es el de la columna `tax_id_tipo` (si falta, se deduce del valor).
 */
export function formatTaxId(valor: string | null | undefined, tipo?: string | null): string {
  if (!valor) return VACIO;
  const t = tipo?.toUpperCase();
  if (t === "CUIT" || t === "CUIL" || (!t && /^\d{2}-?\d{8}-?\d$/.test(valor)))
    return formatCuit(valor);
  return valor.replace(/[\s-]/g, "").toUpperCase();
}
