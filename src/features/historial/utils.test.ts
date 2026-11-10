import { describe, expect, it } from "vitest";
import {
  agruparPorTxid,
  clabeUnica,
  comprobanteDeMov,
  estadoVisible,
  estadoVista,
  formatFechaLinea,
  labelTipoLinea,
  mapMov,
  montoDebitado,
  montoDetalleTexto,
  prettyTipo,
  rangoPagina,
  subFiltroDeVista,
  tiposDeOperacion,
  totalesPagina,
  type Linea,
} from "./utils";

const linea = (p: Partial<Linea>): Linea => ({
  lineId: "l",
  transactionId: "t",
  idTxn: "TX1",
  legajo: "100",
  tipoOperacion: "transferencia",
  tipoLinea: "egreso",
  monto: 0,
  fecha: "2026-10-01T10:00:00",
  lineNo: 1,
  cvu: null,
  email: null,
  nombre: null,
  nombreDestino: null,
  cuit: null,
  estado: "Acreditado",
  moneda: "MXN",
  ...p,
});

describe("mapeos", () => {
  it("prettyTipo", () => {
    expect(prettyTipo("cobro_link")).toBe("Cobros con Tarjeta");
    expect(prettyTipo("otro")).toBe("Otro");
    expect(prettyTipo("")).toBe("Movimiento");
  });

  it("estadoVisible", () => {
    expect(estadoVisible("APROBADO")).toBe("Acreditado");
    expect(estadoVisible("Acreditada")).toBe("Acreditado");
    expect(estadoVisible("rechazado")).toBe("Rechazado");
    expect(estadoVisible(null)).toBe("Pendiente");
  });

  it("filtro de operacion", () => {
    expect(tiposDeOperacion("Todas")).toBeNull();
    expect(tiposDeOperacion("Cobros con Tarjeta")).toEqual(["cobro_link", "tarjeta"]);
    expect(tiposDeOperacion("inexistente")).toBeNull();
    expect(labelTipoLinea("comision")).toBe("Comisión");
  });

  it("formatFechaLinea", () => {
    expect(formatFechaLinea("2026-10-01T09:05:03")).toBe("2026-10-01 09:05:03");
    expect(formatFechaLinea("no")).toBe("—");
  });
});

describe("movimiento y comprobante", () => {
  const egreso = mapMov({
    id_txn: "TX9",
    tipo: "transferencia",
    cvu: "000111",
    monto_operacion: 1000,
    comision: 10,
    impuesto: 2.1,
    fecha: "2026-10-01T10:00:00Z",
    legajo: "100",
    estado_nombre: "Aprobado",
    destinatario_nombre: "Ana",
    destinatario_cuit: "20-1-1",
    destinatario_banco: "Banco X",
    subcuentas: [{ cbu: "999" }],
  });

  it("egreso: debita comision e impuesto", () => {
    expect(egreso.tipo).toBe("egreso");
    expect(egreso.categoria).toBe("Egresos");
    expect(egreso.subcuentaClabe).toBe("999");
    expect(montoDebitado(egreso)).toBeCloseTo(1012.1);
    expect(montoDetalleTexto(egreso)).toMatch(/^- /);
  });

  it("comprobante: en un egreso yo soy el origen", () => {
    const c = comprobanteDeMov(egreso, { nombre: "Yo", rfc: "30", clabe: "111" });
    expect(c.desde).toEqual({ nombre: "Yo", rfc: "30", clabe: "999" });
    expect(c.hacia).toEqual({ nombre: "Ana", rfc: "20-1-1", clabe: "000111", banco: "Banco X" });
  });

  it("comprobante: en un ingreso sin cuenta la contraparte va sin CLABE", () => {
    const ingreso = mapMov({
      id_txn: "TX2",
      tipo: "cobro_link",
      cvu: null,
      monto_operacion: 50,
      fecha: null,
      legajo: "100",
    });
    expect(ingreso.tipo).toBe("ingreso");
    expect(montoDetalleTexto(ingreso)).toMatch(/^\+ /);
    const c = comprobanteDeMov(ingreso, { nombre: "Yo", rfc: "30", clabe: "111" });
    expect(c.hacia.clabe).toBe("111");
    expect(c.desde.clabe).toBe("");
  });

  it("clabeUnica", () => {
    expect(clabeUnica([{ cbu: "1" }, { cbu: "1" }, { cbu: null }])).toBe("1");
    expect(clabeUnica([{ cbu: "1" }, { cbu: "2" }])).toBe("");
    expect(clabeUnica([])).toBe("");
  });
});

describe("lineas", () => {
  const lineas = [
    linea({ lineId: "a", idTxn: "T1", monto: 100, estado: "Pendiente" }),
    linea({ lineId: "b", idTxn: "T1", monto: -5, estado: "Pendiente" }),
    linea({ lineId: "c", idTxn: "T2", monto: -40, estado: "Rechazado" }),
    linea({ lineId: "d", idTxn: "T1", monto: -1 }),
  ];

  it("agrupa por TXID con cabeza y desglose", () => {
    const cerradas = agruparPorTxid(lineas, true, new Set());
    expect(cerradas.map((f) => [f.lineId, f.esCabeza, f.hijas])).toEqual([
      ["a", true, 2],
      ["c", true, 0],
    ]);
    // El desglose queda pegado debajo de su operacion.
    const abiertas = agruparPorTxid(lineas, true, new Set(["T1"]));
    expect(abiertas.map((f) => f.lineId)).toEqual(["a", "b", "d", "c"]);
    const planas = agruparPorTxid(lineas, false, new Set());
    expect(planas.every((f) => !f.esCabeza && f.hijas === 0)).toBe(true);
    expect(planas).toHaveLength(4);
  });

  it("encabeza el ingreso aunque el impuesto y la comision lleguen antes (mas nuevos)", () => {
    // Asi llegan de la base: por fecha, de la mas nueva a la mas vieja.
    const ops = [
      linea({ lineId: "imp", idTxn: "T9", tipoLinea: "impuesto", monto: -0.16, lineNo: 3 }),
      linea({ lineId: "com", idTxn: "T9", tipoLinea: "comision", monto: -1, lineNo: 2 }),
      linea({ lineId: "ing", idTxn: "T9", tipoLinea: "ingreso", monto: 100, lineNo: 1 }),
    ];
    const cerrada = agruparPorTxid(ops, true, new Set());
    expect(cerrada.map((f) => [f.lineId, f.esCabeza, f.hijas])).toEqual([["ing", true, 2]]);
    const abierta = agruparPorTxid(ops, true, new Set(["T9"]));
    expect(abierta.map((f) => f.lineId)).toEqual(["ing", "com", "imp"]);
  });

  it("totales de la pagina", () => {
    expect(totalesPagina(lineas)).toEqual({
      totalIngresos: 100,
      totalEgresos: 46,
      moneda: "MXN",
      netoOtra: 0,
      lineasOtra: 0,
      lineasIngreso: 1,
      lineasEgreso: 3,
      txPendientes: 1,
      txRechazadas: 1,
      totalPendientes: 2,
    });
  });

  it("no suma dolares con pesos: el neto en USD va aparte", () => {
    const t = totalesPagina([
      linea({ idTxn: "D1", tipoLinea: "ingreso", monto: 250 }),
      linea({ idTxn: "FX1", tipoLinea: "egreso", monto: -50 }),
      linea({ idTxn: "FX1-USD", tipoLinea: "ingreso", monto: 2.7, moneda: "USD" }),
    ]);
    expect(t.totalIngresos - t.totalEgresos).toBe(200);
    expect(t.netoOtra).toBeCloseTo(2.7);
    expect(t.lineasOtra).toBe(1);
    // Vista de la subcuenta en dólares: se suma en USD.
    const usd = totalesPagina([linea({ tipoLinea: "ingreso", monto: 2.7, moneda: "USD" })], "USD");
    expect(usd.totalIngresos).toBeCloseTo(2.7);
    expect(usd.lineasOtra).toBe(0);
  });

  it("rango de pagina", () => {
    expect(rangoPagina(1, 25, 0)).toBe("0 registros");
    expect(rangoPagina(2, 25, 30)).toBe("26–30 de 30");
  });
});

describe("vista / subcuenta", () => {
  it("la vista sale del filtro de subcuenta", () => {
    expect(estadoVista("Todas", false, "Caja")).toEqual({ vista: "principal", sub: "Caja" });
    expect(estadoVista("Ventas", false, "Caja")).toEqual({ vista: "sub", sub: "Ventas" });
    // Volver a "Todas" desde los filtros vuelve a la cuenta principal.
    expect(estadoVista("Todas", true, "Caja")).toEqual({ vista: "principal", sub: "Caja" });
    // Sin subcuentas, "Por subcuenta" queda elegida (muestra "Sin subcuentas").
    expect(estadoVista("Todas", true, undefined)).toEqual({ vista: "sub", sub: "" });
  });

  it("elegir una vista fija el filtro de subcuenta", () => {
    expect(subFiltroDeVista("principal", "Caja")).toBe("Todas");
    expect(subFiltroDeVista("sub", "Caja")).toBe("Caja");
    expect(subFiltroDeVista("sub", undefined)).toBe("Todas");
  });
});
