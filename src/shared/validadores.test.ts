import { describe, expect, it } from "vitest";
import {
  digitoClabe,
  validarCbu,
  validarClabe,
  validarCuit,
  validarCurp,
  validarRfc,
} from "./validadores";

describe("validarRfc", () => {
  it("acepta RFC reales de persona física y moral", () => {
    expect(validarRfc("GODE561231GR8")).toBeNull();
    expect(validarRfc("gode-561231-gr8", "fisica")).toBeNull();
    expect(validarRfc("SAT970701NN3", "moral")).toBeNull();
    expect(validarRfc("IMS421231I45")).toBeNull();
  });
  it("acepta los RFC genéricos del SAT", () => {
    expect(validarRfc("XAXX010101000")).toBeNull();
    expect(validarRfc("AAA010101AAA", "moral")).toBeNull();
  });
  it("rechaza largo, formato, fecha y dígito incorrectos", () => {
    expect(validarRfc("")).toBe("Requerido");
    expect(validarRfc("SAT970701NN3", "fisica")).toMatch(/13 caracteres/);
    expect(validarRfc("GODE561231GR")).toMatch(/Formato/);
    expect(validarRfc("GODE561331GR8")).toMatch(/fecha/);
    expect(validarRfc("GODE561231GR9")).toMatch(/verificador/);
  });
});

describe("validarCurp", () => {
  it("acepta una CURP válida", () => {
    expect(validarCurp("HEGG560427MVZRRL04")).toBeNull();
    expect(validarCurp("hegg560427mvzrrl04")).toBeNull();
  });
  it("rechaza largo, entidad y dígito incorrectos", () => {
    expect(validarCurp("HEGG560427MVZRRL0")).toMatch(/18 caracteres/);
    expect(validarCurp("HEGG560427MXXRRL04")).toMatch(/entidad/);
    expect(validarCurp("HEGG560427MVZRRL05")).toMatch(/verificador/);
  });
});

describe("validarClabe", () => {
  it("acepta una CLABE válida (con o sin espacios)", () => {
    expect(validarClabe("032180000118359719")).toBeNull();
    expect(validarClabe("032 180 00011835971 9")).toBeNull();
    expect(validarClabe("032-180-000118359719")).toBeNull();
    expect(digitoClabe("03218000011835971")).toBe("9");
  });
  it("rechaza largo, letras y dígito incorrectos", () => {
    expect(validarClabe("03218000011835971")).toMatch(/18 dígitos/);
    expect(validarClabe("03218000011835971A")).toMatch(/18 dígitos/);
    expect(validarClabe("032180000118359718")).toMatch(/control/);
  });
});

describe("Argentina", () => {
  it("CUIT con dígito verificador", () => {
    expect(validarCuit("20-12345678-6")).toBeNull();
    expect(validarCuit("20-12345678-5")).toMatch(/verificador/);
    expect(validarCuit("2012345678")).toMatch(/11 dígitos/);
  });
  it("CBU con sus dos dígitos verificadores", () => {
    expect(validarCbu("0170099220000067797370")).toBeNull();
    expect(validarCbu("0170099220000067797371")).toMatch(/verificadores/);
  });
});
