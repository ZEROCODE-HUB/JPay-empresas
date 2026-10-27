import { describe, expect, it } from "vitest";
import {
  banderaIdDelMethod,
  cardDigitsMax,
  cvvMax,
  expandMethods,
  formatNro,
  formatVenc,
  getMethodIdFromBandera,
  isCardMethod,
  metodoInicial,
  metodosDisponibles,
  errorVencimiento,
  montoInvalido,
  normalizarBandera,
  parseMonto,
  totalLink,
  validarPago,
  validarSimulacion,
  variantsDeBandera,
  vencPartes,
  type DatosPago,
} from "./utils";

const pagoOk: DatosPago = {
  method: "visa-cred",
  titular: "Juan Perez",
  nro: "4507 9900 0000 4905",
  venc: "12/30",
  cvv: "123",
  documento: "12345678",
  email: "a@b.com",
  montoPagar: "100.00",
  total: 100,
};

describe("banderas y metodos", () => {
  it("mapea la bandera a un metodo visible", () => {
    expect(getMethodIdFromBandera("visa")).toBe("visa-cred");
    expect(getMethodIdFromBandera("Visa_Débito")).toBe("visa-deb");
    expect(getMethodIdFromBandera("visa_algo")).toBe("visa-cred");
    expect(getMethodIdFromBandera("desconocida")).toBe("desconocida");
  });

  it("variantes de una bandera", () => {
    expect(variantsDeBandera("visa")).toEqual(["visa-cred", "visa-deb"]);
    expect(variantsDeBandera("mastercard_débito")).toEqual(["mc-deb"]);
    expect(variantsDeBandera("otra")).toEqual(["otra"]);
  });

  it("normaliza el texto de la bandera", () => {
    expect(normalizarBandera("Visa  Débito")).toBe("visa_débito");
  });

  it("expande categorias de lote y deduplica", () => {
    expect(expandMethods(null)).toEqual([]);
    expect(expandMethods(["TARJETA_DEBITO", "maestro", ""])).toEqual([
      "visa-deb",
      "mc-deb",
      "cabal-deb",
      "maestro",
    ]);
  });

  it("detecta metodos de tarjeta", () => {
    expect(isCardMethod("amex")).toBe(true);
    expect(isCardMethod("qr")).toBe(false);
  });

  it("metodo inicial: primera bandera o primer metodo guardado", () => {
    expect(metodoInicial(["mastercard"], ["qr"])).toBe("mc-cred");
    expect(metodoInicial([], ["TARJETA_CREDITO"])).toBe("visa-cred");
    expect(metodoInicial([], [" qr "])).toBe("");
    expect(metodoInicial([], null)).toBe("");
  });

  it("metodo inicial: si la primera bandera es desconocida, el primer metodo visible", () => {
    expect(metodoInicial(["desconocida", "amex", "visa"], null)).toBe("visa-cred");
    expect(metodoInicial(["desconocida"], ["qr"])).toBe("");
    expect(metodoInicial([], ["otra", "qr"])).toBe("qr");
  });

  it("metodos disponibles: banderas tienen prioridad sobre metodos_pago", () => {
    expect(metodosDisponibles(["visa", "amex"], ["qr"]).map((m) => m.id)).toEqual([
      "visa-cred",
      "amex",
    ]);
    expect(metodosDisponibles([], ["QR", "visa"]).map((m) => m.id)).toEqual(["visa-cred", "qr"]);
    expect(metodosDisponibles([], [])).toEqual([]);
  });

  it("bandera id del metodo elegido", () => {
    const rows = [
      { id: "b1", bandera: "Mastercard" },
      { id: "b2", bandera: "Visa" },
    ];
    expect(banderaIdDelMethod(rows, "visa-deb")).toBe("b2");
    expect(banderaIdDelMethod(rows, "amex")).toBeUndefined();
    expect(banderaIdDelMethod(rows, "")).toBeUndefined();
  });
});

describe("formato de tarjeta", () => {
  it("largos por marca", () => {
    expect(cardDigitsMax("amex")).toBe(15);
    expect(cardDigitsMax("diners")).toBe(14);
    expect(cardDigitsMax("visa-cred")).toBe(16);
    expect(cvvMax("amex")).toBe(4);
    expect(cvvMax("visa-deb")).toBe(3);
  });

  it("formatea el numero", () => {
    expect(formatNro("4507990000004905999", "visa-cred")).toBe("4507 9900 0000 4905");
    expect(formatNro("371234567890123", "amex")).toBe("3712 345678 90123");
    expect(formatNro("3712", "amex")).toBe("3712");
    expect(formatNro("a1b2", "visa-cred")).toBe("12");
  });

  it("formatea el vencimiento y lo parte en mes/anio", () => {
    expect(formatVenc("1")).toBe("1");
    expect(formatVenc("12")).toBe("12");
    expect(formatVenc("1230")).toBe("12/30");
    expect(formatVenc("12/305")).toBe("12/30");
    expect(vencPartes("12/30")).toEqual({ mes: "12", anio: "30" });
    expect(vencPartes("1")).toEqual({ mes: "1", anio: "" });
  });
});

describe("montos", () => {
  it("total del link", () => {
    expect(
      totalLink({
        monto: 999,
        detalle: [
          { producto_nombre: "a", cantidad: 2, precio_unitario: 10 },
          { producto_nombre: "b", cantidad: 1, precio_unitario: 5.5 },
        ],
      }),
    ).toBe(25.5);
    expect(totalLink({ monto: 40, detalle: [] })).toBe(40);
  });

  it("parsea y valida el monto", () => {
    expect(parseMonto("10,5")).toBe(10.5);
    expect(montoInvalido(0, 100)).toBe(true);
    expect(montoInvalido(100.0005, 100)).toBe(false);
    expect(montoInvalido(100.01, 100)).toBe(true);
    expect(montoInvalido(NaN, 100)).toBe(true);
    expect(montoInvalido(Infinity, 100)).toBe(true);
  });

  it("monto parcial vacio es invalido", () => {
    expect(validarPago({ ...pagoOk, montoPagar: "" })).toBe("Monto a pagar invalido");
    expect(validarPago({ ...pagoOk, montoPagar: "abc" })).toBe("Monto a pagar invalido");
    expect(validarSimulacion({ method: "qr", email: "a@b.co", montoPagar: "", total: 1 })).toBe(
      "Monto a pagar invalido",
    );
  });
});

describe("validarPago", () => {
  it("acepta un pago completo", () => {
    expect(validarPago(pagoOk)).toBeNull();
  });

  it("valida cada campo en orden", () => {
    expect(validarPago({ ...pagoOk, method: "" })).toBe("Selecciona un metodo de pago");
    expect(validarPago({ ...pagoOk, titular: " " })).toBe("Ingresa el titular de la tarjeta");
    expect(validarPago({ ...pagoOk, nro: "4507 9900" })).toBe("Numero de tarjeta invalido");
    expect(validarPago({ ...pagoOk, venc: "1230" })).toBe("Vencimiento invalido (MM/AA)");
    expect(validarPago({ ...pagoOk, cvv: "12" })).toBe("CVV invalido");
    expect(validarPago({ ...pagoOk, documento: "123" })).toBe(
      "Ingresa el numero de documento del titular",
    );
    expect(validarPago({ ...pagoOk, email: "a@b" })).toBe("Email invalido");
    expect(validarPago({ ...pagoOk, montoPagar: "200" })).toBe("Monto a pagar invalido");
  });

  it("amex exige 15 digitos y CVV de 4", () => {
    const amex = { ...pagoOk, method: "amex", nro: "3712 345678 90123", cvv: "1234" };
    expect(validarPago(amex)).toBeNull();
    expect(validarPago({ ...amex, cvv: "123" })).toBe("CVV invalido");
  });

  it("sin tarjeta no valida los campos de tarjeta", () => {
    expect(validarPago({ ...pagoOk, method: "qr", nro: "", titular: "", cvv: "" })).toBeNull();
  });

  it("sin link resuelto no valida el monto", () => {
    expect(validarPago({ ...pagoOk, montoPagar: "999", total: null })).toBeNull();
  });
});

describe("vencimiento", () => {
  const hoy = new Date(2026, 9, 27); // octubre 2026

  it("rechaza el mes fuera de 01-12", () => {
    expect(errorVencimiento("00/30", hoy)).toBe("Vencimiento invalido (MM/AA)");
    expect(errorVencimiento("13/30", hoy)).toBe("Vencimiento invalido (MM/AA)");
    expect(errorVencimiento("1/30", hoy)).toBe("Vencimiento invalido (MM/AA)");
  });

  it("rechaza tarjetas vencidas y acepta el mes en curso", () => {
    expect(errorVencimiento("09/26", hoy)).toBe("La tarjeta esta vencida");
    expect(errorVencimiento("12/25", hoy)).toBe("La tarjeta esta vencida");
    expect(errorVencimiento("10/26", hoy)).toBeNull();
    expect(errorVencimiento("11/26", hoy)).toBeNull();
    expect(errorVencimiento("01/27", hoy)).toBeNull();
  });

  it("validarPago usa la validacion del vencimiento", () => {
    expect(validarPago({ ...pagoOk, venc: "13/30" }, hoy)).toBe("Vencimiento invalido (MM/AA)");
    expect(validarPago({ ...pagoOk, venc: "09/26" }, hoy)).toBe("La tarjeta esta vencida");
    expect(validarPago({ ...pagoOk, venc: "10/26" }, hoy)).toBeNull();
  });
});

describe("validarSimulacion", () => {
  it("no exige datos de tarjeta", () => {
    expect(
      validarSimulacion({ method: "visa-cred", email: "a@b.co", montoPagar: "1", total: 1 }),
    ).toBeNull();
    expect(validarSimulacion({ method: "", email: "", montoPagar: "", total: 1 })).toBe(
      "Selecciona un metodo de pago",
    );
    expect(validarSimulacion({ method: "qr", email: "x", montoPagar: "1", total: 1 })).toBe(
      "Email invalido",
    );
    expect(validarSimulacion({ method: "qr", email: "a@b.co", montoPagar: "0", total: 1 })).toBe(
      "Monto a pagar invalido",
    );
  });
});
