import { describe, expect, it } from "vitest";
import { esImagen, PASSWORD_RULES, validatePassword } from "./utils";

describe("validatePassword", () => {
  it("acepta una contraseña que cumple todas las reglas", () => {
    expect(validatePassword("Clave123!")).toBe(true);
  });
  it.each([
    ["corta", "Ab1!"],
    ["sin mayúscula", "clave123!"],
    ["sin número", "Clavesss!"],
    ["sin especial", "Clave1234"],
  ])("rechaza %s", (_, pw) => {
    expect(validatePassword(pw)).toBe(false);
  });
  it("solo admite los especiales !/+-.", () => {
    expect(validatePassword("Clave123#")).toBe(false);
    for (const c of ["!", "/", "+", "-", "."]) expect(validatePassword(`Clave123${c}`)).toBe(true);
  });
  it("expone las 4 reglas para la UI", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(["len", "upper", "num", "special"]);
  });
});

describe("esImagen", () => {
  it("usa el MIME del archivo si lo hay", () => {
    const file = new File(["x"], "doc", { type: "image/png" });
    expect(esImagen({ name: "doc", file })).toBe(true);
  });
  it("cae a la extensión del nombre o la URL", () => {
    expect(esImagen({ name: "Frente.JPG" })).toBe(true);
    expect(esImagen({ name: "", url: "https://x/y.webp" })).toBe(true);
    expect(esImagen({ name: "dni.pdf" })).toBe(false);
  });
  it("devuelve false sin valor", () => {
    expect(esImagen(null)).toBe(false);
  });
});
