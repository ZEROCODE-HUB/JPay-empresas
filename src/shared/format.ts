/**
 * Formato de números, montos, porcentajes, fechas y CUIT para toda la UI (es-AR).
 *
 * Archivo compartido: es idéntico en JPay-admin y JPay-empresas (`npm run shared:check`).
 * Los valores vacíos (null, undefined, NaN, fecha inválida) se muestran como "—".
 */

const LOCALE = "es-AR";
export const VACIO = "—";

type Numero = number | null | undefined;
type Fecha = string | Date | null | undefined;

const esNumero = (n: Numero): n is number => typeof n === "number" && Number.isFinite(n);

/** 1234.5 → "1.234,5" (decimales fijos: `decimals`). */
export function formatNumber(n: Numero, decimals = 0): string {
  if (!esNumero(n)) return VACIO;
  return n.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 1234.5 → "$ 1.234,50"; negativos "-$ 1.234,50". `signo` agrega "+" a los positivos. */
export function formatMoney(n: Numero, opts: { decimals?: number; signo?: boolean } = {}): string {
  if (!esNumero(n)) return VACIO;
  const { decimals = 2, signo = false } = opts;
  const prefijo = n < 0 ? "-" : signo && n > 0 ? "+" : "";
  return `${prefijo}$ ${formatNumber(Math.abs(n), decimals)}`;
}

/** 3.5 → "3,5%" (hasta `maxDecimals` decimales, sin ceros de relleno). El valor ya viene en %. */
export function formatPercent(n: Numero, maxDecimals = 2): string {
  if (!esNumero(n)) return VACIO;
  return `${n.toLocaleString(LOCALE, { maximumFractionDigits: maxDecimals })}%`;
}

/**
 * Convierte a Date. Las fechas sin hora ("2026-03-01") se toman en hora local: `new Date()`
 * las interpreta como UTC y en Argentina se mostrarían como el día anterior.
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
