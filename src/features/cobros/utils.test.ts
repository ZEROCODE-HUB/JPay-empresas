import { describe, expect, it } from "vitest";
import type { LoteGestionRow, RegistroDeLote } from "@/lib/api/cobros-masivos";
import {
  filtrarLotes,
  paginar,
  porcentaje,
  rangoPagina,
  resumenRegistros,
  totalPaginas,
  validarParametros,
  finDiaLocal,
  inicioDiaLocal,
  type ParametrosLote,
} from "./utils";

const reg = (estado: RegistroDeLote["estado"], monto: number, pagado: number) =>
  ({ estado, monto, montoPagado: pagado }) as RegistroDeLote;

const lote = (over: Partial<LoteGestionRow>): LoteGestionRow => ({
  id: "LOT-AAA111",
  nombre: "Expensas",
  periodo: "2026-04",
  createdAt: "2026-04-10T10:00:00Z",
  fechaFinalizacion: null,
  estado: "cargado",
  progreso: 0,
  cantidadPagos: 0,
  cantidadParciales: 0,
  cantidadPendientes: 0,
  montoTotal: 0,
  montoCobrado: 0,
  montoPorCobrar: 0,
  ...over,
});

describe("porcentaje / paginación", () => {
  it("redondea y devuelve 0 con total 0", () => {
    expect(porcentaje(1, 3)).toBe(33);
    expect(porcentaje(2, 3)).toBe(67);
    expect(porcentaje(5, 0)).toBe(0);
  });

  it("calcula páginas y rangos", () => {
    expect(totalPaginas(0, 10)).toBe(1);
    expect(totalPaginas(21, 10)).toBe(3);
    expect(rangoPagina(3, 10, 21)).toBe("21–21 de 21");
    expect(paginar([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });
});

describe("resumenRegistros", () => {
  it("cuenta por estado y suma montos", () => {
    const r = resumenRegistros([
      reg("pagado_total", 100, 100),
      reg("pagado_parcial", 100, 40),
      reg("pendiente", 100, 0),
      reg("vencido", 50, 0),
      reg("error", 50, 0),
    ]);
    expect(r).toEqual({
      totalRegistros: 5,
      cobrados: 1,
      parciales: 1,
      pendientes: 1,
      vencidos: 1,
      conError: 1,
      montoTotal: 400,
      montoCobrado: 140,
      pctCobrado: 35,
    });
  });

  it("lote vacío", () => {
    expect(resumenRegistros([]).pctCobrado).toBe(0);
  });
});

describe("filtrarLotes", () => {
  const lotes = [
    lote({ id: "LOT-A", nombre: "Expensas Abril", estado: "en_proceso" }),
    lote({ id: "LOT-B", nombre: "Cuotas", periodo: "2026-05", createdAt: "2026-05-02T00:00:00Z" }),
  ];
  const sin = { busqueda: "", estado: "todos" as const, desde: "", hasta: "" };

  it("sin filtros devuelve todo", () => {
    expect(filtrarLotes(lotes, sin)).toHaveLength(2);
  });

  it("busca por nombre (sin mayúsculas), ID y período", () => {
    expect(filtrarLotes(lotes, { ...sin, busqueda: "expensas" }).map((l) => l.id)).toEqual([
      "LOT-A",
    ]);
    expect(filtrarLotes(lotes, { ...sin, busqueda: "lot-b" }).map((l) => l.id)).toEqual(["LOT-B"]);
    expect(filtrarLotes(lotes, { ...sin, busqueda: "2026-05" }).map((l) => l.id)).toEqual([
      "LOT-B",
    ]);
  });

  it("filtra por estado y por fecha de creación inclusive", () => {
    expect(filtrarLotes(lotes, { ...sin, estado: "en_proceso" })).toHaveLength(1);
    expect(filtrarLotes(lotes, { ...sin, desde: "2026-05-02" }).map((l) => l.id)).toEqual([
      "LOT-B",
    ]);
    expect(filtrarLotes(lotes, { ...sin, hasta: "2026-04-10" }).map((l) => l.id)).toEqual([
      "LOT-A",
    ]);
  });
});

describe("validarParametros", () => {
  const ok: ParametrosLote = {
    nombre: "Lote",
    periodo: "2026-04",
    diaProcesamiento: 15,
    tasaInteres: 10,
    fechaVenc1: "2026-04-20",
    fechaVenc2: "",
    fechaVenc3: "",
    mediosPago: ["TRANSFERENCIA"],
    pagosParciales: true,
    notificaciones: false,
  };
  const manana = "2026-04-11";

  it("acepta parámetros válidos", () => {
    expect(validarParametros(ok, manana)).toBeNull();
  });

  it.each<[Partial<ParametrosLote>, string]>([
    [{ nombre: "  " }, "El nombre del lote es obligatorio"],
    [{ periodo: "" }, "Selecciona el periodo"],
    [{ diaProcesamiento: 0 }, "El dia de pago debe ser un numero entre 1 y 31"],
    [{ diaProcesamiento: 32 }, "El dia de pago debe ser un numero entre 1 y 31"],
    [
      { fechaVenc1: "2026-04-10" },
      "La primera fecha de vencimiento no puede ser anterior a manana",
    ],
    [{ fechaVenc2: "2026-04-20" }, "El 2º vencimiento debe ser posterior al 1º"],
    [
      { fechaVenc2: "2026-04-25", fechaVenc3: "2026-04-25" },
      "El 3º vencimiento debe ser posterior al 2º",
    ],
    [{ mediosPago: [] }, "Selecciona al menos un medio de pago"],
  ])("rechaza %o", (over, msg) => {
    expect(validarParametros({ ...ok, ...over }, manana)).toBe(msg);
  });

  it("rechaza 3er vencimiento sin 2do", () => {
    expect(validarParametros({ ...ok, fechaVenc3: "2026-05-01" }, manana)).toBe(
      "Para cargar el 3º vencimiento primero carga el 2º vencimiento",
    );
  });
});

describe("rango personalizado del dashboard", () => {
  it("el Hasta incluye todo el día local y el Desde arranca a las 00:00 locales", () => {
    const desde = inicioDiaLocal("2026-10-01");
    const hasta = finDiaLocal("2026-10-27");
    expect([desde.getFullYear(), desde.getMonth(), desde.getDate(), desde.getHours()]).toEqual([
      2026, 9, 1, 0,
    ]);
    expect([
      hasta.getFullYear(),
      hasta.getMonth(),
      hasta.getDate(),
      hasta.getHours(),
      hasta.getMinutes(),
      hasta.getSeconds(),
      hasta.getMilliseconds(),
    ]).toEqual([2026, 9, 27, 23, 59, 59, 999]);
    // Un lote creado a la noche del último día entra en el rango.
    expect(new Date(2026, 9, 27, 22, 0).getTime()).toBeLessThanOrEqual(hasta.getTime());
  });
});
