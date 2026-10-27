import { describe, expect, it } from "vitest";
import {
  csvAFilas,
  esExcel,
  filasARegistros,
  montoTotalFilas,
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

  it("no soporta comillas: una coma dentro de un valor desplaza columnas (comportamiento actual)", () => {
    expect(csvAFilas('a,b\n"x, y",z')).toEqual([{ a: '"x', b: 'y"' }]);
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

  it("arma registros con la configuración del lote", () => {
    const res = validarFilas([{ ...base, medios_de_pago: "QR", email: "a@b.c" }]);
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
