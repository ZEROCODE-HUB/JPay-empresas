import { describe, expect, it } from "vitest";
import {
  PAIS_INSTALACION,
  PAISES,
  conModulos,
  filtrarPorModulo,
  tieneModulo,
  getPais,
  paisPorCodigo,
  regimenesPara,
  setPaisActivo,
  type Modulo,
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

describe("módulos por país", () => {
  type Item = { label: string; modulo?: Modulo; items?: Item[] };
  const menu: Item[] = [
    { label: "Inicio" },
    { label: "Transferir", modulo: "transferencias_salientes" },
    { label: "Puntos físicos", modulo: "pos" },
    {
      label: "Impuestos",
      items: [
        { label: "IIBB", modulo: "iibb" },
        { label: "Débitos y créditos", modulo: "debitos_creditos" },
      ],
    },
  ];
  const etiquetas = (xs: Item[]) =>
    xs.map((x) => (x.items ? `${x.label}[${x.items.map((i) => i.label).join(",")}]` : x.label));

  it("México y Argentina muestran cosas distintas, y los grupos vacíos desaparecen", () => {
    expect(etiquetas(filtrarPorModulo(menu, PAISES.MX))).toEqual(["Inicio", "Puntos físicos"]);
    expect(etiquetas(filtrarPorModulo(menu, PAISES.AR))).toEqual([
      "Inicio",
      "Transferir",
      "Impuestos[IIBB,Débitos y créditos]",
    ]);
  });

  it("los módulos guardados en la base pisan los del archivo, solo claves conocidas", () => {
    const mx = conModulos(PAISES.MX, { pos: false, iibb: true, inventado: true, spei: "si" });
    expect(tieneModulo("pos", mx)).toBe(false);
    expect(tieneModulo("iibb", mx)).toBe(true);
    expect(tieneModulo("spei", mx)).toBe(true);
    expect("inventado" in mx.modulos).toBe(false);
    expect(PAISES.MX.modulos.pos).toBe(true);
    expect(conModulos(PAISES.MX, null)).toBe(PAISES.MX);
  });

  it("los dos países definen las mismas claves", () => {
    expect(Object.keys(PAISES.AR.modulos).sort()).toEqual(Object.keys(PAISES.MX.modulos).sort());
  });
});
