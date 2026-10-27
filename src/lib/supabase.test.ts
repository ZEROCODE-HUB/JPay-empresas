import { describe, expect, it } from "vitest";
import { getAuthErrorMessage, isPermissionError, toDataError } from "./supabase";

describe("getAuthErrorMessage", () => {
  it("traduce credenciales inválidas", () => {
    expect(getAuthErrorMessage("Invalid login credentials")).toBe("Usuario o contraseña incorrectos.");
  });

  it("usa un mensaje genérico para errores desconocidos", () => {
    expect(getAuthErrorMessage("algo raro")).toBe("No se pudo iniciar sesión. Intentalo nuevamente.");
  });
});

describe("isPermissionError", () => {
  it("detecta el código 42501 de Postgres", () => {
    expect(isPermissionError({ code: "42501", message: "x" })).toBe(true);
  });

  it("detecta errores de RLS por el mensaje", () => {
    expect(isPermissionError({ message: "new row violates row-level security policy" })).toBe(true);
  });

  it("no confunde otros errores con falta de permiso", () => {
    expect(isPermissionError(new Error("timeout"))).toBe(false);
  });
});

describe("toDataError", () => {
  it("normaliza valores que no son objetos", () => {
    expect(toDataError("falló")).toEqual({ code: null, message: "falló" });
  });
});
