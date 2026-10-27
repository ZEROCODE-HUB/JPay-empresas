import { describe, expect, it } from "vitest";
import type { CalendarioAcreditacion } from "@/lib/api/calendario-acreditaciones";
import type { DiaAcreditacion, LoteAcredDetalle, Ticket } from "@/lib/api/liquidaciones";
import {
  adelantosEnCursoDelDia,
  agruparPorFecha,
  calcularOferta,
  comisionCierrePct,
  diasDeLaGrilla,
  maxMontoAdelanto,
  mesAnterior,
  mesSiguiente,
  montoDelDia,
  montoReservado,
  netoFinalLote,
  ordenarAcreditados,
  paginar,
  ticketDelDia,
  totalesDelDia,
} from "./utils";

const lote = (p: Partial<CalendarioAcreditacion>): CalendarioAcreditacion => ({
  id: "l",
  codigo: "C",
  comercioId: "c",
  comercioNombre: "",
  comercioLegajo: "",
  bandera: "VISA",
  fechaVenta: "2026-10-01",
  fechaAcreditacion: "2026-10-10",
  diasHabilesAplicados: null,
  cantidadOperaciones: 0,
  importeBruto: 0,
  impuestos: 0,
  tasaPaywayPct: 0,
  tasaPaywayMonto: 0,
  tasaPropiaPct: 0,
  tasaPropiaMonto: 0,
  comisionCierreLoteMonto: 0,
  contracargoMonto: 0,
  importeNeto: 0,
  estadoLote: "",
  estadoCalculado: "programado",
  adelantosReservadosTotal: 0,
  adelantosAplicadosDia: 0,
  ...p,
});

const ticket = (p: Partial<Ticket>): Ticket => ({
  id: "T",
  fecha: "2026-10-01",
  montoSolicitado: 0,
  montoPorAcreditar: 0,
  fechaAcreditacion: "",
  estado: "pendiente",
  ...p,
});

const dias: DiaAcreditacion[] = [
  { date: "2026-10-10", label: "10/10", monto: 500, cantidad: 3 },
  { date: "2026-10-12", label: "12/10", monto: 2000, cantidad: 5 },
];

describe("diasDeLaGrilla", () => {
  it("arma semanas completas de lunes a domingo", () => {
    // Octubre 2026 empieza jueves: 3 días de relleno (lun-mié) antes del 1.
    const g = diasDeLaGrilla(10, 2026, new Date(2026, 9, 15));
    expect(g.length % 7).toBe(0);
    expect(g.slice(0, 3).every((d) => d.esOtroMes)).toBe(true);
    expect(g[3].fecha.getDate()).toBe(1);
    expect(g[3].esOtroMes).toBe(false);
    expect(g.filter((d) => !d.esOtroMes)).toHaveLength(31);
  });

  it("marca hoy y los días pasados", () => {
    const g = diasDeLaGrilla(10, 2026, new Date(2026, 9, 15, 12));
    const hoy = g.find((d) => d.esActual);
    expect(hoy?.fecha.getDate()).toBe(15);
    expect(g.find((d) => !d.esOtroMes && d.fecha.getDate() === 14)?.esPasado).toBe(true);
    expect(g.find((d) => !d.esOtroMes && d.fecha.getDate() === 16)?.esPasado).toBe(false);
  });

  it("un mes que empieza en lunes no lleva relleno inicial", () => {
    // Junio 2026 empieza lunes.
    expect(diasDeLaGrilla(6, 2026, new Date(2020, 0, 1))[0].esOtroMes).toBe(false);
  });
});

describe("mesAnterior / mesSiguiente", () => {
  it("cruzan el año", () => {
    expect(mesAnterior({ mes: 1, anio: 2026 })).toEqual({ mes: 12, anio: 2025 });
    expect(mesSiguiente({ mes: 12, anio: 2026 })).toEqual({ mes: 1, anio: 2027 });
    expect(mesSiguiente({ mes: 5, anio: 2026 })).toEqual({ mes: 6, anio: 2026 });
  });
});

describe("totales del día", () => {
  const items = [
    lote({
      id: "a",
      importeBruto: 1000,
      importeNeto: 900,
      adelantosAplicadosDia: 300,
      cantidadOperaciones: 2,
    }),
    lote({ id: "b", importeBruto: 500, importeNeto: 450, cantidadOperaciones: 1 }),
  ];

  it("suma bruto, neto, adelantos y operaciones; libre = neto − adelantos", () => {
    expect(totalesDelDia(items)).toEqual({
      bruto: 1500,
      neto: 1350,
      adelantos: 300,
      operaciones: 3,
      libre: 1050,
    });
  });

  it("libre nunca es negativo", () => {
    expect(totalesDelDia([lote({ importeNeto: 100, adelantosAplicadosDia: 400 })]).libre).toBe(0);
  });

  it("agrupa por fecha de acreditación", () => {
    const m = agruparPorFecha([...items, lote({ id: "c", fechaAcreditacion: "2026-10-11" })]);
    expect(m.get("2026-10-10")).toHaveLength(2);
    expect(m.get("2026-10-11")).toHaveLength(1);
  });

  it("% de cierre de lote y neto final del lote", () => {
    expect(comisionCierrePct(lote({ importeBruto: 2000, comisionCierreLoteMonto: 30 }))).toBe(1.5);
    expect(comisionCierrePct(lote({ importeBruto: 0, comisionCierreLoteMonto: 30 }))).toBe(0);
    expect(netoFinalLote(lote({ importeNeto: 900, adelantosAplicadosDia: 300 }))).toBe(600);
    expect(netoFinalLote(lote({ importeNeto: 100, adelantosAplicadosDia: 300 }))).toBe(0);
  });
});

describe("adelantos", () => {
  it("calcularOferta: interés = monto × TEM / 100 al centavo, TNA = TEM × 12", () => {
    expect(calcularOferta(100000, 4.5)).toEqual({ interes: 4500, neto: 95500, tna: 54 });
    expect(calcularOferta(333.33, 3).interes).toBe(10);
    expect(calcularOferta(100, 150).neto).toBe(0);
  });

  it("montoReservado suma solo pendientes y aprobados", () => {
    const ts = [
      ticket({ estado: "pendiente", montoSolicitado: 100 }),
      ticket({ estado: "aprobado", montoSolicitado: 50 }),
      ticket({ estado: "acreditado", montoSolicitado: 1000 }),
      ticket({ estado: "cancelado", montoSolicitado: 1000 }),
    ];
    expect(montoReservado(ts)).toBe(150);
  });

  it("maxMontoAdelanto: tope del día elegido sin pasar el disponible", () => {
    expect(maxMontoAdelanto(null, dias, 1000)).toBe(1000);
    expect(maxMontoAdelanto("2026-10-10", dias, 1000)).toBe(500);
    expect(maxMontoAdelanto("2026-10-12", dias, 1000)).toBe(1000);
    expect(maxMontoAdelanto("2026-01-01", dias, 1000)).toBe(1000);
  });

  it("montoDelDia: monto del día o todo lo por acreditar", () => {
    expect(montoDelDia(null, dias, 7000)).toBe(7000);
    expect(montoDelDia("2026-10-12", dias, 7000)).toBe(2000);
    expect(montoDelDia("2026-01-01", dias, 7000)).toBe(7000);
  });

  it("adelantosEnCursoDelDia descarta los cerrados", () => {
    const base = {
      montoSolicitado: 1,
      montoPorAcreditar: null,
      plazoOriginalDias: 0,
      plazoAdelantadoDias: 0,
      tasaInteresPct: null,
      fechaSolicitud: "",
      fechaResolucion: null,
      fechaAcreditacion: null,
      motivo: null,
    };
    const r = adelantosEnCursoDelDia([
      { ...base, id: "1", estado: "Pendiente" },
      { ...base, id: "2", estado: "Aprobado" },
      { ...base, id: "3", estado: "Acreditado" },
      { ...base, id: "4", estado: "Rechazado" },
      { ...base, id: "5", estado: "Cancelado" },
    ]);
    expect(r.map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("ticketDelDia usa la fecha de acreditación y si no la de solicitud", () => {
    const ts = [
      ticket({ id: "A", fechaAcreditacion: "2026-10-10T00:00:00" }),
      ticket({ id: "B", fecha: "2026-10-11", fechaAcreditacion: "" }),
    ];
    expect(ticketDelDia(ts, "2026-10-10")?.id).toBe("A");
    expect(ticketDelDia(ts, "2026-10-11")?.id).toBe("B");
    expect(ticketDelDia(ts, "2026-10-12")).toBeNull();
    expect(ticketDelDia(ts, null)).toBeNull();
  });
});

describe("listados", () => {
  it("ordenarAcreditados: más reciente primero, sin mutar la entrada", () => {
    const l = (id: string, fecha: string, fechaAcreditacion?: string): LoteAcredDetalle => ({
      id,
      fecha,
      fechaAcreditacion,
      bandera: "",
      cantidadOperaciones: 0,
      importeNeto: 0,
      comisionCierrePct: null,
      comisionCierreMonto: null,
    });
    const entrada = [
      l("a", "2026-01-01", "2026-02-01"),
      l("b", "2026-03-01"),
      l("c", "2026-01-05", "2026-01-20"),
    ];
    expect(ordenarAcreditados(entrada).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(entrada.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("paginar devuelve filas, total de páginas y rango", () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(paginar(items, 3, 10)).toEqual({
      totalPages: 3,
      rows: [20, 21, 22],
      desde: 21,
      hasta: 23,
    });
    expect(paginar([], 1, 10).totalPages).toBe(1);
  });
});
