import type { MovimientoDashboard } from "@/lib/api/movimientos";
import { toDate } from "@/shared/format";

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
  cobrosQR: number;
  linkPago: number;
  total: number;
};

export type KpisDashboard = {
  saldo: number;
  depositos: number;
  opsDep: number;
  retiros: number;
  opsRet: number;
  cuentas: number;
  cobrosLink: number;
  opsLink: number;
  cobrosQR: number;
  opsQR: number;
  pagosQR: number;
  opsPagoQR: number;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "aaaa-mm-dd" de la fecha LOCAL (no UTC: en Argentina las 22 h ya serían el día siguiente). */
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

const monto = (m: MovimientoDashboard) => Math.abs(Number(m.monto_operacion ?? 0));

/** Totales por día (depósitos, cobros QR, link de pago) para el gráfico de barras. */
export function agruparPorDia(movs: MovimientoDashboard[], start: Date, end: Date): FilaDia[] {
  const byDate = new Map<string, FilaDia>();
  eachDay(start, end).forEach((d) => {
    byDate.set(toKey(d), { date: fmtKey(d), depositos: 0, cobrosQR: 0, linkPago: 0, total: 0 });
  });
  movs.forEach((m) => {
    const fecha = toDate(m.fecha);
    const row = fecha ? byDate.get(toKey(fecha)) : undefined;
    if (!row) return;
    const amt = monto(m);
    if (m.tipo === "deposito") row.depositos += amt;
    else if (m.tipo === "cobro_pct") row.cobrosQR += amt;
    else if (m.tipo === "tarjeta") row.linkPago += amt;
    row.total = row.depositos + row.cobrosQR + row.linkPago;
  });
  return Array.from(byDate.values());
}

export function calcularKpis(
  movs: MovimientoDashboard[],
  saldo: number,
  cuentas: number,
): KpisDashboard {
  const sum = (t: string) => movs.filter((x) => x.tipo === t).reduce((a, x) => a + monto(x), 0);
  const count = (t: string) => movs.filter((x) => x.tipo === t).length;
  return {
    saldo,
    depositos: sum("deposito"),
    opsDep: count("deposito"),
    retiros: sum("retiro"),
    opsRet: count("retiro"),
    cuentas,
    cobrosLink: sum("tarjeta"),
    opsLink: count("tarjeta"),
    cobrosQR: sum("cobro_pct"),
    opsQR: count("cobro_pct"),
    pagosQR: sum("pago_pct"),
    opsPagoQR: count("pago_pct"),
  };
}
