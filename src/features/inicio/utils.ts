import type { ResumenPeriodo } from "@/lib/api/movimientos";

export type PeriodKey = "today" | "15d" | "30d" | "60d" | "90d" | "day" | "range";

export const QUICK: Array<{ k: PeriodKey; l: string; days: number }> = [
  { k: "today", l: "Hoy", days: 1 },
  { k: "15d", l: "15 días", days: 15 },
  { k: "30d", l: "30 días", days: 30 },
  { k: "60d", l: "60 días", days: 60 },
  { k: "90d", l: "90 días", days: 90 },
];

export type FilaDia = {
  date: string;
  depositos: number;
  linkPago: number;
  total: number;
};

export type KpisDashboard = {
  /** Saldo en pesos (disponible + retenido). */
  saldo: number;
  /** Saldo de la subcuenta en dólares, aparte (no se suma con los pesos). */
  saldoUsd: number;
  hayUsd: boolean;
  depositos: number;
  opsDep: number;
  /** Todas las salidas en pesos: envíos SPEI, conversiones, retiros y ajustes (sin comisiones). */
  salidas: number;
  opsSal: number;
  comisiones: number;
  cuentas: number;
  cobrosLink: number;
  opsLink: number;
  /** true si los cobros con tarjeta son de prueba (todavía no hay cobros reales). */
  tarjetaPruebas: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "aaaa-mm-dd" de la fecha LOCAL (no UTC: en la Ciudad de México las 18 h ya serían el día siguiente). */
export function toKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fmtKey(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Días (a medianoche local) entre `start` y `end`, ambos incluidos; como mucho 366. */
export function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  let guard = 0;
  while (s <= e && guard < 366) {
    out.push(new Date(s));
    s.setDate(s.getDate() + 1);
    guard++;
  }
  return out;
}

/** Rango [start, end] del período elegido; `now` se inyecta para poder testear. */
export function calcularRango(
  period: PeriodKey,
  day: string,
  desde: string,
  hasta: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (period === "day") {
    const d = new Date(day + "T00:00:00");
    return {
      start: d,
      end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
    };
  }
  if (period === "range") {
    const s = desde ? new Date(desde + "T00:00:00") : today;
    const e = hasta
      ? new Date(hasta + "T23:59:59")
      : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    return { start: s, end: e };
  }
  const days = QUICK.find((p) => p.k === period)?.days ?? 30;
  const s = new Date(today);
  s.setDate(today.getDate() - (days - 1));
  const e = new Date(today);
  e.setHours(23, 59, 59, 999);
  return { start: s, end: e };
}

export function etiquetaPeriodo(period: PeriodKey, day: string, desde: string, hasta: string) {
  if (period === "day") return day;
  if (period === "range") return `${desde || "?"} – ${hasta || "?"}`;
  return QUICK.find((p) => p.k === period)?.l ?? "30 días";
}

/**
 * Entorno de los cobros con tarjeta a mostrar: los reales si hay alguno; si no, los de prueba.
 * Nunca se suman los dos.
 */
export function entornoTarjeta(r: ResumenPeriodo): string {
  const reales = [...r.cobros_tarjeta, ...r.serie_tarjeta].some((c) => c.entorno !== "sandbox");
  return reales ? "produccion" : "sandbox";
}

const enEntorno = (entorno: string, elegido: string) =>
  elegido === "sandbox" ? entorno === "sandbox" : entorno !== "sandbox";

/** Totales por día (depósitos y cobros con tarjeta, en pesos) para el gráfico de barras. */
export function serieDiaria(r: ResumenPeriodo | undefined, start: Date, end: Date): FilaDia[] {
  const byDate = new Map<string, FilaDia>();
  eachDay(start, end).forEach((d) => {
    byDate.set(toKey(d), { date: fmtKey(d), depositos: 0, linkPago: 0, total: 0 });
  });
  if (!r) return Array.from(byDate.values());
  const entorno = entornoTarjeta(r);
  for (const d of r.serie) {
    const row = d.moneda === "MXN" ? byDate.get(d.dia) : undefined;
    if (row) row.depositos += Number(d.depositos);
  }
  for (const t of r.serie_tarjeta) {
    const row = t.moneda === "MXN" && enEntorno(t.entorno, entorno) ? byDate.get(t.dia) : undefined;
    if (row) row.linkPago += Number(t.monto);
  }
  byDate.forEach((row) => (row.total = row.depositos + row.linkPago));
  return Array.from(byDate.values());
}

/** KPIs del Inicio a partir del resumen del período (en pesos; los dólares, aparte). */
export function kpisDesdeResumen(r: ResumenPeriodo | undefined): KpisDashboard {
  const mxn = r?.monedas.MXN;
  const usd = r?.monedas.USD;
  const entorno = r ? entornoTarjeta(r) : "produccion";
  const tarjeta = (r?.cobros_tarjeta ?? []).filter(
    (c) => c.moneda === "MXN" && enEntorno(c.entorno, entorno),
  );
  return {
    saldo: Number(mxn?.saldo ?? 0),
    saldoUsd: Number(usd?.saldo ?? 0),
    hayUsd: !!usd && Number(usd.cuentas) > 0,
    depositos: Number(mxn?.por_categoria.deposito?.monto ?? 0),
    opsDep: Number(mxn?.por_categoria.deposito?.ops ?? 0),
    salidas: Number(mxn?.salidas ?? 0),
    opsSal: Number(mxn?.ops_salidas ?? 0),
    comisiones: Number(mxn?.comisiones ?? 0) + Number(mxn?.iva ?? 0),
    cuentas: Number(r?.cuentas ?? 0),
    cobrosLink: tarjeta.reduce((a, c) => a + Number(c.monto), 0),
    opsLink: tarjeta.reduce((a, c) => a + Number(c.ops), 0),
    tarjetaPruebas: entorno === "sandbox" && tarjeta.length > 0,
  };
}
