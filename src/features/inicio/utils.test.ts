import { describe, expect, it } from "vitest";
import type { ResumenMoneda, ResumenPeriodo } from "@/lib/api/movimientos";
import {
  calcularRango,
  eachDay,
  entornoTarjeta,
  etiquetaPeriodo,
  fmtKey,
  kpisDesdeResumen,
  serieDiaria,
  toKey,
} from "./utils";

const moneda = (o: Partial<ResumenMoneda>): ResumenMoneda => ({
  saldo: 0,
  disponible: 0,
  retenido: 0,
  cuentas: 1,
  entradas: 0,
  ops_entradas: 0,
  salidas: 0,
  ops_salidas: 0,
  comisiones: 0,
  iva: 0,
  por_categoria: {},
  pendiente: 0,
  ops_pendientes: 0,
  rechazado: 0,
  ops_rechazadas: 0,
  ...o,
});

const resumen = (o: Partial<ResumenPeriodo>): ResumenPeriodo => ({
  zona_horaria: "America/Mexico_City",
  cuentas: 0,
  monedas: {},
  cobros_tarjeta: [],
  serie: [],
  serie_tarjeta: [],
  ...o,
});

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

describe("KPIs desde el resumen de la base", () => {
  const r = resumen({
    cuentas: 2,
    monedas: {
      MXN: moneda({
        saldo: 217.94,
        salidas: 128,
        ops_salidas: 3,
        comisiones: 3.5,
        iva: 0.56,
        por_categoria: { deposito: { monto: 350, ops: 2 }, conversion: { monto: -128, ops: 3 } },
      }),
      USD: moneda({ saldo: 5.91 }),
    },
    cobros_tarjeta: [
      { entorno: "sandbox", moneda: "MXN", monto: 999, ops: 9 },
      { entorno: "produccion", moneda: "MXN", monto: 150, ops: 1 },
    ],
  });

  it("pesos y dólares no se mezclan", () => {
    const k = kpisDesdeResumen(r);
    expect(k.saldo).toBe(217.94);
    expect(k.saldoUsd).toBe(5.91);
    expect(k.hayUsd).toBe(true);
  });
  it("salidas incluyen conversiones y no las comisiones", () => {
    const k = kpisDesdeResumen(r);
    expect(k.depositos).toBe(350);
    expect(k.salidas).toBe(128);
    expect(k.comisiones).toBeCloseTo(4.06);
    expect(k.cuentas).toBe(2);
  });
  it("cobros con tarjeta: los reales, sin sumar los de prueba", () => {
    const k = kpisDesdeResumen(r);
    expect(k.cobrosLink).toBe(150);
    expect(k.opsLink).toBe(1);
    expect(k.tarjetaPruebas).toBe(false);
  });
  it("si solo hay cobros de prueba, se muestran marcados como de prueba", () => {
    const solo = resumen({
      cobros_tarjeta: [{ entorno: "sandbox", moneda: "MXN", monto: 5, ops: 1 }],
    });
    expect(entornoTarjeta(solo)).toBe("sandbox");
    expect(kpisDesdeResumen(solo)).toMatchObject({ cobrosLink: 5, tarjetaPruebas: true });
  });
  it("sin datos todo queda en cero (la pantalla muestra «cargando» mientras tanto)", () => {
    expect(kpisDesdeResumen(undefined)).toMatchObject({ saldo: 0, hayUsd: false, cuentas: 0 });
  });
});

describe("serie diaria", () => {
  it("toKey usa la fecha local, no la UTC", () => {
    expect(toKey(new Date(2026, 4, 1, 23, 30))).toBe("2026-05-01");
    expect(toKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
  it("llena todos los días del rango, solo pesos, e ignora lo de afuera", () => {
    const filas = serieDiaria(
      resumen({
        serie: [
          { dia: "2026-05-01", moneda: "MXN", depositos: 100, entradas: 100, salidas: 0 },
          { dia: "2026-05-01", moneda: "USD", depositos: 7, entradas: 7, salidas: 0 },
          { dia: "2026-06-01", moneda: "MXN", depositos: 999, entradas: 999, salidas: 0 },
        ],
        serie_tarjeta: [{ dia: "2026-05-02", entorno: "produccion", moneda: "MXN", monto: 20 }],
      }),
      new Date(2026, 4, 1),
      new Date(2026, 4, 3, 23, 59),
    );
    expect(filas).toHaveLength(3);
    expect(filas[0]).toMatchObject({ depositos: 100, linkPago: 0, total: 100 });
    expect(filas[1]).toMatchObject({ depositos: 0, linkPago: 20, total: 20 });
    expect(filas[2].total).toBe(0);
  });
});
