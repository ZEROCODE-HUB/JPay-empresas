import { describe, expect, it } from "vitest";
import type { PuntoVenta } from "@/lib/api/qr";
import { FILTROS_VACIOS, filtrarPdvs, hayFiltros, rangoPagina, resumenTotal } from "./utils";

const pdvs: PuntoVenta[] = [
  { id: "1", nombre: "Caja Principal", estado: "Activado", created_at: "2026-01-10T12:00:00Z" },
  { id: "2", nombre: "Mostrador", estado: "Desactivado", created_at: "2026-02-15T09:00:00Z" },
  {
    id: "3",
    nombre: "Caja 2",
    estado: "Pendiente de aprobación",
    created_at: "2026-03-01T00:00:00Z",
  },
];

describe("filtrarPdvs", () => {
  it("sin filtros devuelve todo", () => {
    expect(filtrarPdvs(pdvs, FILTROS_VACIOS)).toHaveLength(3);
  });
  it("filtra por nombre sin distinguir mayúsculas", () => {
    expect(filtrarPdvs(pdvs, { ...FILTROS_VACIOS, search: "caja" }).map((p) => p.id)).toEqual([
      "1",
      "3",
    ]);
  });
  it("filtra por estado", () => {
    expect(
      filtrarPdvs(pdvs, { ...FILTROS_VACIOS, estado: "Desactivado" }).map((p) => p.id),
    ).toEqual(["2"]);
  });
  it("filtra por rango de fechas inclusivo", () => {
    const r = filtrarPdvs(pdvs, {
      ...FILTROS_VACIOS,
      fechaInicio: "2026-02-15",
      fechaFin: "2026-03-01",
    });
    expect(r.map((p) => p.id)).toEqual(["2", "3"]);
  });
});

describe("hayFiltros", () => {
  it("detecta filtros activos", () => {
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false);
    expect(hayFiltros({ ...FILTROS_VACIOS, fechaFin: "2026-01-01" })).toBe(true);
  });
});

describe("textos", () => {
  it("resumenTotal", () => {
    expect(resumenTotal(1, 1)).toBe("Total: 1 punto de venta");
    expect(resumenTotal(3, 3)).toBe("Total: 3 puntos de venta");
    expect(resumenTotal(2, 3)).toBe("2 de 3 puntos");
  });
  it("rangoPagina", () => {
    expect(rangoPagina(1, 10, 0)).toBe("0 registros");
    expect(rangoPagina(2, 10, 15)).toBe("11–15 de 15");
  });
});
