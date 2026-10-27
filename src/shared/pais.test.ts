import { describe, expect, it } from "vitest";
import {
  PAIS_INSTALACION,
  PAISES,
  getPais,
  paisPorCodigo,
  regimenesPara,
  setPaisActivo,
} from "./pais";

describe("pais", () => {
  it("la instalación es México", () => {
    expect(PAIS_INSTALACION).toBe("MX");
  });

  it("cambia el país activo", () => {
    setPaisActivo("AR");
    expect(getPais().moneda).toBe("ARS");
    setPaisActivo("MX");
    expect(getPais().moneda).toBe("MXN");
  });

  it("valida con los identificadores del país", () => {
    const mx = PAISES.MX;
    expect(mx.fiscal.moral.validar("SAT970701NN3")).toBeNull();
    expect(mx.fiscal.fisica.validar("SAT970701NN3")).not.toBeNull();
    expect(mx.personal?.validar("HEGG560427MVZRRL04")).toBeNull();
    expect(mx.cuentaBancaria.validar("032180000118359719")).toBeNull();
    expect(mx.fiscal.fisica.normalizar(" gode-561231-gr8 ")).toBe("GODE561231GR8");
    expect(mx.domicilio.regiones).toHaveLength(32);
  });

  it("filtra regímenes por tipo de persona", () => {
    const fisica = regimenesPara(PAISES.MX, "fisica").map((r) => r.codigo);
    const moral = regimenesPara(PAISES.MX, "moral").map((r) => r.codigo);
    expect(fisica).toContain("612");
    expect(fisica).toContain("626");
    expect(fisica).not.toContain("601");
    expect(moral).toContain("601");
    expect(moral).toContain("626");
  });

  it("paisPorCodigo", () => {
    expect(paisPorCodigo("MX")?.nombre).toBe("México");
    expect(paisPorCodigo("BR")).toBeNull();
    expect(paisPorCodigo(null)).toBeNull();
  });
});
