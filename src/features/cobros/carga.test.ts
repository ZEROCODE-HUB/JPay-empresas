import { describe, expect, it } from "vitest";
import {
  csvAFilas,
  detectarSeparador,
  esExcel,
  filasARegistros,
  montoTotalFilas,
  parsearBooleano,
  parsearMediosPago,
  validarFilas,
  type FilaCruda,
} from "./carga";

const base: FilaCruda = {
  tipo_entidad: "edificio",
  id_entidad: "6",
  sub_entidad: "UF 3D",
  identificacion_usuario: "Perez Juan",
  monto: "48200",
  descripcion: "Expensas",
};

describe("csvAFilas", () => {
  it("usa la primera línea como encabezado en minúscula e ignora líneas vacías", () => {
    const filas = csvAFilas("Tipo_Entidad, Monto\nedificio, 100\n\n club ,200\n");
    expect(filas).toEqual([
      { tipo_entidad: "edificio", monto: "100" },
      { tipo_entidad: "club", monto: "200" },
    ]);
  });

  it("completa columnas faltantes con vacío", () => {
    expect(csvAFilas("a,b,c\n1")).toEqual([{ a: "1", b: "", c: "" }]);
  });

  it("devuelve null sin filas de datos", () => {
    expect(csvAFilas("a,b\n")).toBeNull();
    expect(csvAFilas("")).toBeNull();
  });

  it("respeta campos entre comillas con separador, comillas escapadas y saltos de línea", () => {
    expect(csvAFilas('a,b\r\n"Perez, Juan","dice ""hola"""\r\n"linea\ndos",z')).toEqual([
      { a: "Perez, Juan", b: 'dice "hola"' },
      { a: "linea\ndos", b: "z" },
    ]);
  });

  it("detecta el separador ; por la cabecera", () => {
    expect(detectarSeparador("a;b;c")).toBe(";");
    expect(detectarSeparador("a,b,c")).toBe(",");
    expect(detectarSeparador('"x,y";b;c')).toBe(";");
    expect(csvAFilas('monto;descripcion\n1500,50;"Cuota; marzo"')).toEqual([
      { monto: "1500,50", descripcion: "Cuota; marzo" },
    ]);
  });
});

describe("validarFilas", () => {
  it("normaliza opcionales y convierte números", () => {
    const res = validarFilas([{ ...base, email: "", tasa_interes: "5.5" }]);
    expect(res).toEqual({
      ok: true,
      filas: [
        {
          tipo_entidad: "edificio",
          id_entidad: "6",
          sub_entidad: "UF 3D",
          identificacion_usuario: "Perez Juan",
          monto: 48200,
          descripcion: "Expensas",
          email: undefined,
          periodo_facturacion: undefined,
          id_unico_beneficiario: undefined,
          fecha_vencimiento_1: undefined,
          fecha_vencimiento_2: undefined,
          fecha_vencimiento_3: undefined,
          tasa_interes: 5.5,
          medios_de_pago: undefined,
          pagos_parciales_habilitado: undefined,
        },
      ],
    });
  });

  it.each<[FilaCruda, string]>([
    [{ ...base, monto: "" }, "Fila 2: el monto debe ser un numero positivo"],
    [{ ...base, monto: "-3" }, "Fila 2: el monto debe ser un numero positivo"],
    [{ ...base, monto: "abc" }, "Fila 2: el monto debe ser un numero positivo"],
    [
      { ...base, sub_entidad: "" },
      "Fila 2: tipo_entidad, id_entidad y sub_entidad son obligatorios",
    ],
    [{ ...base, identificacion_usuario: "" }, "Fila 2: identificacion_usuario es obligatorio"],
    [
      { ...base, fecha_vencimiento_1: "2026-04-10", fecha_vencimiento_3: "2026-05-10" },
      "Fila 2: fecha_vencimiento_3 requiere cargar fecha_vencimiento_2",
    ],
    [
      { ...base, medios_de_pago: "TRANSFERENCIA|EFECTIVO" },
      "Fila 2: medios_de_pago invalido (usar TRANSFERENCIA, TARJETA_CREDITO, TARJETA_DEBITO, QR separados por |)",
    ],
    [
      { ...base, pagos_parciales_habilitado: "quizas" },
      "Fila 2: pagos_parciales_habilitado debe ser true o false",
    ],
  ])("corta en la primera fila inválida (%o)", (mala, msg) => {
    expect(validarFilas([base, mala, mala])).toEqual({ ok: false, error: msg });
  });

  it("acepta valores numéricos tal como los entrega la lectura de Excel", () => {
    const res = validarFilas([{ ...base, monto: 150 as unknown as string }]);
    expect(res.ok && res.filas[0].monto).toBe(150);
  });
});

describe("helpers de carga", () => {
  it("detecta Excel por extensión", () => {
    expect(esExcel("a.xlsx")).toBe(true);
    expect(esExcel("a.xls")).toBe(true);
    expect(esExcel("a.csv")).toBe(false);
  });

  it("suma montos", () => {
    const res = validarFilas([base, { ...base, monto: "1800" }]);
    expect(res.ok && montoTotalFilas(res.filas)).toBe(50000);
  });

  it("parsea medios de pago y booleanos de la fila", () => {
    expect(parsearMediosPago("transferencia|QR")).toEqual(["TRANSFERENCIA", "QR"]);
    expect(parsearMediosPago("TARJETA_CREDITO, QR")).toEqual(["TARJETA_CREDITO", "QR"]);
    expect(parsearMediosPago("")).toBeUndefined();
    expect(parsearMediosPago("EFECTIVO")).toBeNull();
    expect(parsearBooleano("true")).toBe(true);
    expect(parsearBooleano("No")).toBe(false);
    expect(parsearBooleano(false)).toBe(false);
    expect(parsearBooleano("")).toBeUndefined();
    expect(parsearBooleano("x")).toBeNull();
  });

  it("aplica medios de pago y pagos parciales de cada fila; si faltan usa los del lote", () => {
    const res = validarFilas([
      { ...base, medios_de_pago: "QR|TARJETA_DEBITO", pagos_parciales_habilitado: "true" },
      { ...base, pagos_parciales_habilitado: false as unknown as string },
      base,
    ]);
    if (!res.ok) throw new Error(res.error);
    const regs = filasARegistros(res.filas, "LOT-1", ["TRANSFERENCIA"], true, () => "R");
    expect(regs.map((r) => [r.mediosPago, r.pagosParcialesHabilitado])).toEqual([
      [["QR", "TARJETA_DEBITO"], true],
      [["TRANSFERENCIA"], false],
      [["TRANSFERENCIA"], true],
    ]);
  });

  it("arma registros con la configuración del lote", () => {
    const res = validarFilas([{ ...base, email: "a@b.c" }]);
    if (!res.ok) throw new Error(res.error);
    let n = 0;
    const regs = filasARegistros(res.filas, "LOT-1", ["TRANSFERENCIA"], false, () => `REG-${++n}`);
    expect(regs[0]).toMatchObject({
      id: "REG-1",
      loteId: "LOT-1",
      monto: 48200,
      email: "a@b.c",
      fechaVencimiento1: null,
      mediosPago: ["TRANSFERENCIA"],
      pagosParcialesHabilitado: false,
      estado: "pendiente",
      montoPagado: 0,
    });
  });
});
