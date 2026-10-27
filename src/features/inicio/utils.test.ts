import { describe, expect, it } from "vitest";
import type { MovimientoDashboard } from "@/lib/api/movimientos";
import {
  agruparPorDia,
  calcularKpis,
  calcularRango,
  eachDay,
  etiquetaPeriodo,
  fmtKey,
  toKey,
} from "./utils";

const mov = (tipo: string, monto: number, fecha: string) =>
  ({ tipo, monto_operacion: monto, fecha }) as unknown as MovimientoDashboard;

describe("eachDay", () => {
  it("incluye ambos extremos y corta en 366", () => {
    expect(eachDay(new Date(2026, 0, 30), new Date(2026, 1, 2, 15))).toHaveLength(4);
    expect(eachDay(new Date(2026, 0, 2), new Date(2026, 0, 1))).toHaveLength(0);
    expect(eachDay(new Date(2020, 0, 1), new Date(2026, 0, 1))).toHaveLength(366);
  });
  it("fmtKey es dd/mm", () => {
    expect(fmtKey(new Date(2026, 2, 5))).toBe("05/03");
  });
});

describe("calcularRango", () => {
  const now = new Date(2026, 9, 27, 15, 30);
  it("atajo de N días termina hoy al final del día", () => {
    const r = calcularRango("15d", "", "", "", now);
    expect(r.start).toEqual(new Date(2026, 9, 13));
    expect(r.end).toEqual(new Date(2026, 9, 27, 23, 59, 59, 999));
    expect(calcularRango("today", "", "", "", now).start).toEqual(new Date(2026, 9, 27));
  });
  it("día específico y rango", () => {
    const d = calcularRango("day", "2026-05-10", "", "", now);
    expect(d.start).toEqual(new Date(2026, 4, 10));
    expect(d.end).toEqual(new Date(2026, 4, 10, 23, 59, 59, 999));
    const r = calcularRango("range", "", "2026-05-01", "", now);
    expect(r.start).toEqual(new Date(2026, 4, 1));
    expect(r.end).toEqual(new Date(2026, 9, 27, 23, 59, 59, 999));
  });
  it("etiqueta del período", () => {
    expect(etiquetaPeriodo("30d", "", "", "")).toBe("30 días");
    expect(etiquetaPeriodo("range", "", "2026-01-01", "")).toBe("2026-01-01 – ?");
    expect(etiquetaPeriodo("day", "2026-01-01", "", "")).toBe("2026-01-01");
  });
});

describe("agregados", () => {
  const movs = [
    mov("deposito", 100, "2026-05-01T10:00:00Z"),
    mov("deposito", -50, "2026-05-01T12:00:00Z"),
    mov("cobro_pct", 30, "2026-05-02T10:00:00Z"),
    mov("tarjeta", 20, "2026-05-02T11:00:00Z"),
    mov("retiro", 70, "2026-05-02T11:00:00Z"),
    mov("pago_pct", 5, "2026-05-03T11:00:00Z"),
    mov("deposito", 999, "2026-06-01T10:00:00Z"),
  ];

  it("KPIs suman montos absolutos por tipo", () => {
    expect(calcularKpis(movs, 1234, 3)).toEqual({
      saldo: 1234,
      depositos: 1149,
      opsDep: 3,
      retiros: 70,
      opsRet: 1,
      cuentas: 3,
      cobrosLink: 20,
      opsLink: 1,
      cobrosQR: 30,
      opsQR: 1,
      pagosQR: 5,
      opsPagoQR: 1,
    });
  });

  it("agrupa por día dentro del rango e ignora lo de afuera", () => {
    const filas = agruparPorDia(movs, new Date(2026, 4, 1), new Date(2026, 4, 3, 23, 59));
    expect(filas).toHaveLength(3);
    const total = filas.reduce((a, f) => a + f.total, 0);
    expect(total).toBe(200);
    expect(filas.every((f) => f.total === f.depositos + f.cobrosQR + f.linkPago)).toBe(true);
  });
});

describe("agrupación por fecha local", () => {
  it("toKey usa la fecha local, no la UTC", () => {
    expect(toKey(new Date(2026, 4, 1, 23, 30))).toBe("2026-05-01");
    expect(toKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
  it("un movimiento a las 23:30 locales cae en ese día aunque en UTC sea otro", () => {
    const local = new Date(2026, 4, 1, 23, 30);
    const filas = agruparPorDia(
      [mov("deposito", 10, local.toISOString())],
      new Date(2026, 4, 1),
      new Date(2026, 4, 2, 23, 59),
    );
    expect(filas[0].depositos).toBe(10);
    expect(filas[1].depositos).toBe(0);
  });
  it("cuenta las transacciones reales por tipo", () => {
    const k = calcularKpis(
      [mov("tarjeta", 85000, "2026-05-01"), mov("tarjeta", 1, "2026-05-01")],
      0,
      1,
    );
    expect(k.cobrosLink).toBe(85001);
    expect(k.opsLink).toBe(2);
    expect(k.opsQR).toBe(0);
  });
});
