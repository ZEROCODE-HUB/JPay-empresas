import { Globe, Zap } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { Item, TxHist } from "./types";
import {
  CATEGORIAS,
  daysUntil,
  filtrarHistorial,
  nuevoServicio,
  ordenarPorVencimiento,
  ordenarServicios,
  parseDate,
  preview,
  totalAPagar,
} from "./utils";

const item = (n: string, v: string, venc: string, extra: Partial<Item> = {}): Item => ({
  n,
  c: "Cliente 1",
  v,
  venc,
  icon: Zap,
  cat: "Impuestos",
  e: "Pendiente",
  suscrito: true,
  ...extra,
});

describe("fechas", () => {
  it("parseDate lee dd/mm/aaaa", () => {
    const d = parseDate("05/03/2026");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 5]);
  });

  it("daysUntil cuenta días desde hoy (negativo si ya pasó)", () => {
    const hoy = new Date(2026, 9, 27, 15, 30);
    expect(daysUntil("30/10/2026", hoy)).toBe(3);
    expect(daysUntil("27/10/2026", hoy)).toBe(0);
    expect(daysUntil("20/10/2026", hoy)).toBe(-7);
  });
});

describe("ordenarServicios", () => {
  const a = item("Beta", "$ 1.500,50", "10/11/2026");
  const b = item("Alfa", "$ 900,00", "05/11/2026");
  const c = item("Gama", "$ 20.000,00", "01/12/2026");

  it("por vencimiento", () => {
    expect(ordenarServicios([a, b, c], "vencimiento").map((s) => s.n)).toEqual([
      "Alfa",
      "Beta",
      "Gama",
    ]);
  });

  it("por monto", () => {
    expect(ordenarServicios([c, a, b], "monto").map((s) => s.n)).toEqual(["Alfa", "Beta", "Gama"]);
  });

  it("alfabético y no muta el original", () => {
    const orig = [c, a, b];
    expect(ordenarServicios(orig, "alfabetico").map((s) => s.n)).toEqual(["Alfa", "Beta", "Gama"]);
    expect(orig[0]).toBe(c);
  });

  it("ordenarPorVencimiento", () => {
    expect(ordenarPorVencimiento([c, a, b]).map((s) => s.n)).toEqual(["Alfa", "Beta", "Gama"]);
  });
});

describe("totalAPagar", () => {
  it("suma los montos ignorando los no numéricos", () => {
    expect(
      totalAPagar([item("a", "$ 100", "-"), item("b", "$ 250", "-"), item("c", "-", "-")]),
    ).toBe(350);
  });

  it("conserva el comportamiento actual: la coma decimal se descarta", () => {
    expect(totalAPagar([item("a", "$ 1.234,56", "-")])).toBe(123456);
  });
});

describe("filtrarHistorial", () => {
  const h: TxHist[] = [
    { f: "01/10/2026", s: "Luz", cat: "Servicios publicos", m: "$ 1", e: "Pagado" },
    { f: "15/10/2026", s: "AFIP", cat: "Impuestos", m: "$ 2", e: "Vencido" },
  ];
  const base = { cat: "Todas", status: "Todos", desde: "" };

  it("sin filtros devuelve todo", () => {
    expect(filtrarHistorial(h, base)).toHaveLength(2);
  });

  it("por categoría y estado", () => {
    expect(filtrarHistorial(h, { ...base, cat: "Impuestos" }).map((t) => t.s)).toEqual(["AFIP"]);
    expect(filtrarHistorial(h, { ...base, status: "Pagado" }).map((t) => t.s)).toEqual(["Luz"]);
  });

  it("desde en dd/mm/aaaa", () => {
    expect(filtrarHistorial(h, { ...base, desde: "10/10/2026" }).map((t) => t.s)).toEqual(["AFIP"]);
  });
});

describe("nuevoServicio", () => {
  it("usa el nombre, o la categoría si está vacío, y el icono de la categoría", () => {
    const s = nuevoServicio("  ", "Servicios publicos", " 123 ");
    expect(s).toMatchObject({
      n: "Servicios publicos",
      c: "Cliente 123",
      v: "$ 0",
      venc: "-",
      e: "Proximo",
      suscrito: true,
    });
    expect(s.icon).toBe(Zap);
    expect(nuevoServicio("Mio", "Otra", "1").icon).toBe(Globe);
  });
});

describe("varios", () => {
  it("CATEGORIAS excluye 'Todos'", () => {
    expect(CATEGORIAS).not.toContain("Todos");
    expect(CATEGORIAS).toHaveLength(5);
  });

  it("preview corta a 5 salvo all", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    expect(preview(xs, false)).toEqual([1, 2, 3, 4, 5]);
    expect(preview(xs, true)).toBe(xs);
  });
});
