import { describe, expect, it } from "vitest";
import { emailValido, esEmailNoConfirmado, estadoLoginDesdeCliente } from "./utils";

describe("emailValido", () => {
  it("acepta un correo con usuario, dominio y TLD", () => {
    expect(emailValido("hola@empresa.com")).toBe(true);
  });
  it.each(["", "hola", "hola@empresa", "hola @empresa.com", "@empresa.com"])("rechaza %j", (e) => {
    expect(emailValido(e)).toBe(false);
  });
});

describe("estadoLoginDesdeCliente", () => {
  it.each([
    ["activado", "aprobado"],
    ["activo", "aprobado"],
    ["deshabilitado", "rechazado"],
    ["eliminado", "rechazado"],
    ["rechazado", "rechazado"],
    ["registrado", "pendiente"],
    ["pendiente_verificacion", "pendiente"],
    ["", "pendiente"],
  ])("%j → %s", (raw, esperado) => {
    expect(estadoLoginDesdeCliente(raw)).toBe(esperado);
  });
});

describe("esEmailNoConfirmado", () => {
  it("detecta el mensaje de Supabase sin importar mayúsculas", () => {
    expect(esEmailNoConfirmado("Email not confirmed")).toBe(true);
    expect(esEmailNoConfirmado("Invalid login credentials")).toBe(false);
  });
});
