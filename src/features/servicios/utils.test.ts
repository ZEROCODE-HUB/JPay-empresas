import { Globe, Zap } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { Item, Remesa, TxHist } from "./types";
import {
  buscarServicios,
  CATEGORIAS,
  daysUntil,
  kpisRemesas,
  textoVencimiento,
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

  it("suma con decimales (punto de miles, coma decimal)", () => {
    expect(totalAPagar([item("a", "$ 1.234,56", "-"), item("b", "$ 0,44", "-")])).toBe(1235);
    expect(totalAPagar([item("a", "$ 10,25", "-"), item("b", "$ 0,10", "-")])).toBe(10.35);
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

  it("desde en aaaa-mm-dd (lo que entrega el input date)", () => {
    expect(filtrarHistorial(h, { ...base, desde: "2026-10-10" }).map((t) => t.s)).toEqual(["AFIP"]);
    expect(filtrarHistorial(h, { ...base, desde: "2026-10-01" })).toHaveLength(2);
  });

  it("busca por servicio o categoría", () => {
    expect(filtrarHistorial(h, { ...base, q: "luz" }).map((t) => t.s)).toEqual(["Luz"]);
    expect(filtrarHistorial(h, { ...base, q: "impuest" }).map((t) => t.s)).toEqual(["AFIP"]);
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

describe("textoVencimiento", () => {
  const hoy = new Date(2026, 9, 27, 10);
  it("sin fecha de vencimiento muestra 'Sin vencimiento' (no NaN)", () => {
    expect(textoVencimiento("-", hoy)).toEqual({ texto: "Sin vencimiento", vencido: false });
    expect(textoVencimiento("", hoy).texto).toBe("Sin vencimiento");
  });
  it("con fecha muestra días restantes o vencidos", () => {
    expect(textoVencimiento("30/10/2026", hoy)).toEqual({
      texto: "Vence en 3 dias",
      vencido: false,
    });
    expect(textoVencimiento("25/10/2026", hoy)).toEqual({
      texto: "Vencido hace 2 dias",
      vencido: true,
    });
  });
  it("un servicio sin vencimiento queda al final al ordenar", () => {
    const sinVenc = item("Nuevo", "$ 0", "-");
    const conVenc = item("Luz", "$ 1", "05/11/2026");
    expect(ordenarPorVencimiento([sinVenc, conVenc]).map((s) => s.n)).toEqual(["Luz", "Nuevo"]);
  });
});

describe("buscarServicios", () => {
  const lista = [
    item("Edenor", "$ 1", "-", { cat: "Servicios publicos", c: "Cliente 123" }),
    item("Fibertel", "$ 1", "-", { cat: "Telefonia e internet", c: "Cliente 999" }),
  ];
  it("filtra por nombre, número de cliente o categoría", () => {
    expect(buscarServicios(lista, "eden").map((s) => s.n)).toEqual(["Edenor"]);
    expect(buscarServicios(lista, "999").map((s) => s.n)).toEqual(["Fibertel"]);
    expect(buscarServicios(lista, "TELEFONIA").map((s) => s.n)).toEqual(["Fibertel"]);
    expect(buscarServicios(lista, "  ")).toHaveLength(2);
  });
});

describe("kpisRemesas", () => {
  const hoy = new Date(2026, 9, 27);
  it("sin datos todo en 0", () => {
    expect(kpisRemesas([], hoy)).toEqual({ enviadasMes: 0, montoMes: 0, paises: 0, enProceso: 0 });
  });
  it("calcula del mes actual, países distintos y en proceso", () => {
    const r = (f: string, pais: string, mARS: string, e: Remesa["e"]): Remesa => ({
      f,
      pais,
      banco: "B",
      mARS,
      mDest: "-",
      tc: "-",
      e,
    });
    expect(
      kpisRemesas(
        [
          r("02/10/2026", "Colombia", "$ 1.000,50", "Completado"),
          r("20/10/2026", "Mexico", "$ 500", "En proceso"),
          r("15/09/2026", "Colombia", "$ 9.999", "En proceso"),
        ],
        hoy,
      ),
    ).toEqual({ enviadasMes: 2, montoMes: 1500.5, paises: 2, enProceso: 2 });
  });
});
