import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatTaxId,
  formatTime,
  monedaActiva,
  parseMonto,
  toDate,
} from "./format";

describe("formatNumber", () => {
  it("usa separadores es-MX", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(1234.5, 2)).toBe("1,234.50");
  });
  it("muestra — para vacíos", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
  });
});

describe("formatMoney", () => {
  it("dos decimales por defecto", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(monedaActiva()).toBe("MXN");
  });
  it("respeta decimales y signo", () => {
    expect(formatMoney(1234.5, { decimals: 0 })).toBe("$1,235");
    expect(formatMoney(-50)).toBe("-$50.00");
    expect(formatMoney(50, { signo: true })).toBe("+$50.00");
    expect(formatMoney(0, { signo: true })).toBe("$0.00");
  });
  it("muestra — para vacíos", () => {
    expect(formatMoney(undefined)).toBe("—");
  });
  it("otra moneda va con su código; la del país, con su símbolo", () => {
    expect(formatMoney(1234.5, { moneda: "USD" })).toBe("US$ 1,234.50");
    expect(formatMoney(1234.5, { moneda: "MXN" })).toBe("$1,234.50");
  });
});

describe("formatPercent", () => {
  it("no rellena con ceros", () => {
    expect(formatPercent(3.5)).toBe("3.5%");
    expect(formatPercent(21)).toBe("21%");
    expect(formatPercent(0.125)).toBe("0.13%");
  });
});

describe("fechas", () => {
  it("las fechas sin hora no se corren de día por la zona horaria", () => {
    expect(formatDate("2026-03-01")).toBe("01/03/2026");
    expect(toDate("2026-03-01")?.getDate()).toBe(1);
  });
  it("formatea Date locales", () => {
    const d = new Date(2026, 9, 5, 9, 7);
    expect(formatDate(d)).toBe("05/10/2026");
    expect(formatDateShort(d)).toBe("05/10");
    expect(formatDateTime(d)).toBe("05/10/2026 09:07");
    expect(formatTime(d)).toBe("09:07");
  });
  it("muestra — para vacíos o inválidos", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("no es fecha")).toBe("—");
  });
});

describe("formatTaxId", () => {
  it("RFC, CURP y CLABE en mayúsculas y sin espacios ni guiones", () => {
    expect(formatTaxId("gode 561231 gr8", "RFC")).toBe("GODE561231GR8");
    expect(formatTaxId("SAT-970701-NN3")).toBe("SAT970701NN3");
    expect(formatTaxId(null)).toBe("—");
  });
});

describe("parseMonto", () => {
  it("punto decimal y coma de miles", () => {
    expect(parseMonto("1,234.50")).toBe(1234.5);
    expect(parseMonto("$1,500")).toBe(1500);
    expect(parseMonto("1500.5")).toBe(1500.5);
    expect(parseMonto("1500,5")).toBe(1500.5);
    expect(parseMonto("1,234,567.8")).toBe(1234567.8);
    expect(parseMonto("-250")).toBe(-250);
    expect(parseMonto("MXN 99.9")).toBe(99.9);
  });
  it("NaN si no es un número", () => {
    expect(parseMonto("")).toBeNaN();
    expect(parseMonto(null)).toBeNaN();
    expect(parseMonto("abc")).toBeNaN();
    expect(parseMonto("1.2.3")).toBeNaN();
  });
});
