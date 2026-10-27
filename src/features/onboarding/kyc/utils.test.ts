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
});

describe("armarAlta", () => {
  const registro = { nombre: "Ana", apellido: "Pérez", fechaNac: "1990-01-01" };
  it("persona física usa CUIT/CUIL y nombre completo", () => {
    const r = armarAlta(addr, "fisica", registro, { cuitCuil: "20-1-3", esPEP: false }, {});
    expect(r.cuit).toBe("20-1-3");
    expect(r.nombre).toBe("Ana Pérez");
    expect(r.perfil).toMatchObject({
      cuitCuil: "20-1-3",
      esPEP: false,
      fechaNacimiento: "1990-01-01",
    });
  });
  it("persona jurídica usa CUIT y nombre legal de la empresa", () => {
    const r = armarAlta(addr, "juridica", registro, {}, { cuit: "30-1-9", nombreLegal: "ACME SA" });
    expect(r.cuit).toBe("30-1-9");
    expect(r.nombre).toBe("ACME SA");
    expect(r.perfil).toMatchObject({ nombreLegal: "ACME SA", direccion: "Calle 1" });
  });
  it("jurídica sin nombre legal cae al nombre del registro", () => {
    expect(armarAlta(addr, "juridica", registro, {}, {}).nombre).toBe("Ana");
  });
});
