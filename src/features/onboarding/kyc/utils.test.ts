import { describe, expect, it } from "vitest";
import {
  ARCHIVOS_VACIOS,
  archivosDesdeDocumentos,
  armarAlta,
  puedeAvanzar,
  validarDomicilio,
  type Domicilio,
} from "./utils";

const archivo = { name: "x.png", url: "blob:x" };
const addr: Domicilio = {
  direccion: "Calle 1",
  direccion2: "",
  ciudad: "CABA",
  provincia: "Buenos Aires",
  cp: "1000",
};

describe("archivosDesdeDocumentos", () => {
  it("mapea los tipos conocidos y usa label, nombre del archivo o tipo", () => {
    const res = archivosDesdeDocumentos([
      { tipo: "id_frente", url: "a/b/frente.jpg", label: "Frente", signedUrl: "https://s/1" },
      { tipo: "id_dorso", url: "a/b/dorso.jpg", label: "", signedUrl: null },
      { tipo: "otro", url: "a/otro.pdf", label: "", signedUrl: null },
    ]);
    expect(res.dniFrente).toEqual({ name: "Frente", url: "https://s/1" });
    expect(res.dniDorso).toEqual({ name: "dorso.jpg", url: undefined });
    expect(res.servicio).toBeNull();
    expect(res.selfie).toBeNull();
  });
});

describe("puedeAvanzar", () => {
  it("paso DNI pide frente y dorso", () => {
    expect(puedeAvanzar(0, { ...ARCHIVOS_VACIOS, dniFrente: archivo })).toBe(false);
    expect(puedeAvanzar(0, { ...ARCHIVOS_VACIOS, dniFrente: archivo, dniDorso: archivo })).toBe(
      true,
    );
  });
  it("servicio y selfie piden su archivo; domicilio siempre", () => {
    expect(puedeAvanzar(1, ARCHIVOS_VACIOS)).toBe(false);
    expect(puedeAvanzar(1, { ...ARCHIVOS_VACIOS, servicio: archivo })).toBe(true);
    expect(puedeAvanzar(2, { ...ARCHIVOS_VACIOS, selfie: archivo })).toBe(true);
    expect(puedeAvanzar(3, ARCHIVOS_VACIOS)).toBe(true);
  });
});

describe("validarDomicilio", () => {
  it("no marca nada si está completo (direccion2 es opcional)", () => {
    expect(validarDomicilio(addr)).toEqual({});
  });
  it("marca los campos vacíos o en blanco", () => {
    expect(
      validarDomicilio({ direccion: " ", direccion2: "", ciudad: "", provincia: "", cp: "" }),
    ).toEqual({
      direccion: "Requerido",
      ciudad: "Requerido",
      provincia: "Requerido",
      cp: "Requerido",
    });
  });
  it("valida el largo del código postal si el país lo fija", () => {
    expect(validarDomicilio({ ...addr, cp: "0610" }, 5)).toEqual({ cp: "Debe tener 5 dígitos" });
    expect(validarDomicilio({ ...addr, cp: "06100" }, 5)).toEqual({});
  });
});

describe("armarAlta", () => {
  const registro = { nombre: "Ana", apellido: "Pérez", fechaNac: "1990-01-01" };
  it("persona física usa su identificador fiscal y nombre completo", () => {
    const r = armarAlta(
      addr,
      "fisica",
      registro,
      {
        taxId: "GODE561231GR8",
        idPersonal: "HEGG560427MVZRRL04",
        regimenFiscal: "612",
        esPEP: false,
      },
      {},
    );
    expect(r.taxId).toBe("GODE561231GR8");
    expect(r.nombre).toBe("Ana Pérez");
    expect(r.perfil).toMatchObject({
      idPersonal: "HEGG560427MVZRRL04",
      regimenFiscal: "612",
      cuentaBancaria: null,
      esPEP: false,
      fechaNacimiento: "1990-01-01",
    });
  });
  it("persona jurídica usa el identificador fiscal y la razón social de la empresa", () => {
    const r = armarAlta(
      addr,
      "juridica",
      registro,
      {},
      { taxId: "SAT970701NN3", cuentaBancaria: "032180000118359719", nombreLegal: "ACME SA" },
    );
    expect(r.taxId).toBe("SAT970701NN3");
    expect(r.perfil).toMatchObject({ cuentaBancaria: "032180000118359719" });
    expect(r.nombre).toBe("ACME SA");
    expect(r.perfil).toMatchObject({ nombreLegal: "ACME SA", direccion: "Calle 1" });
  });
  it("jurídica sin nombre legal cae al nombre del registro", () => {
    expect(armarAlta(addr, "juridica", registro, {}, {}).nombre).toBe("Ana");
  });
});
