import { describe, expect, it } from "vitest";
import {
  formatCuit,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatTime,
  toDate,
} from "./format";

describe("formatNumber", () => {
  it("usa separadores es-AR", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
    expect(formatNumber(1234.5, 2)).toBe("1.234,50");
  });
  it("muestra — para vacíos", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
  });
});

describe("formatMoney", () => {
  it("dos decimales por defecto", () => {
    expect(formatMoney(1234.5)).toBe("$ 1.234,50");
  });
  it("respeta decimales y signo", () => {
    expect(formatMoney(1234.5, { decimals: 0 })).toBe("$ 1.235");
    expect(formatMoney(-50)).toBe("-$ 50,00");
    expect(formatMoney(50, { signo: true })).toBe("+$ 50,00");
    expect(formatMoney(0, { signo: true })).toBe("$ 0,00");
  });
  it("muestra — para vacíos", () => {
    expect(formatMoney(undefined)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("no rellena con ceros", () => {
    expect(formatPercent(3.5)).toBe("3,5%");
    expect(formatPercent(21)).toBe("21%");
    expect(formatPercent(0.125)).toBe("0,13%");
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

describe("formatCuit", () => {
  it("agrega guiones", () => {
    expect(formatCuit("20123456789")).toBe("20-12345678-9");
    expect(formatCuit("20-12345678-9")).toBe("20-12345678-9");
  });
  it("deja intacto lo que no es CUIT", () => {
    expect(formatCuit("123")).toBe("123");
    expect(formatCuit(null)).toBe("—");
  });
});
