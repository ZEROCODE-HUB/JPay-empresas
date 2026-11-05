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

  it("el país activo es México", () => {
    setPaisActivo("MX");
    expect(getPais().moneda).toBe("MXN");
    expect(getPais().cuentaBancaria.tipo).toBe("CLABE");
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
    { label: "Puntos físicos", modulo: "pos" },
    { label: "Facturas", modulo: "cfdi" },
    {
      label: "Cobros",
      items: [
        { label: "Suscripciones", modulo: "suscripciones" },
        { label: "Domiciliación", modulo: "domiciliacion" },
      ],
    },
    { label: "Impuestos", items: [{ label: "CFDI", modulo: "cfdi" }] },
  ];
  const etiquetas = (xs: Item[]) =>
    xs.map((x) => (x.items ? `${x.label}[${x.items.map((i) => i.label).join(",")}]` : x.label));

  it("oculta lo que el país no tiene, y los grupos vacíos desaparecen", () => {
    expect(etiquetas(filtrarPorModulo(menu, PAISES.MX))).toEqual([
      "Inicio",
      "Puntos físicos",
      "Cobros[Suscripciones,Domiciliación]",
    ]);
  });

  it("los módulos guardados en la base pisan los del archivo, solo claves conocidas", () => {
    const mx = conModulos(PAISES.MX, { pos: false, cfdi: true, inventado: true, spei: "si" });
    expect(tieneModulo("pos", mx)).toBe(false);
    expect(tieneModulo("cfdi", mx)).toBe(true);
    expect(tieneModulo("spei", mx)).toBe(true);
    expect("inventado" in mx.modulos).toBe(false);
    expect(PAISES.MX.modulos.pos).toBe(true);
    expect(conModulos(PAISES.MX, null)).toBe(PAISES.MX);
  });
});
