import { describe, expect, it } from "vitest";
import { EQUIPO_INICIAL, OPCIONES_TIEMPO_SESION } from "./estados";
import {
  mfaActivo,
  SIN_EXPIRACION,
  tiempoCustomValido,
  validarCambioPassword,
  validarInvitacion,
} from "./utils";

describe("validarCambioPassword", () => {
  it("exige todos los campos, 12 caracteres y que coincidan", () => {
    expect(validarCambioPassword({ actual: "", nueva: "x", repetir: "x" })).toBe(
      "Completá todos los campos",
    );
    expect(validarCambioPassword({ actual: "a", nueva: "corta", repetir: "corta" })).toBe(
      "Mínimo 12 caracteres",
    );
    expect(
      validarCambioPassword({ actual: "a", nueva: "123456789012", repetir: "123456789013" }),
    ).toBe("Las contraseñas no coinciden");
    expect(
      validarCambioPassword({ actual: "a", nueva: "123456789012", repetir: "123456789012" }),
    ).toBeNull();
  });
});

describe("validarInvitacion", () => {
  it("valida email, duplicados y nombre en ese orden", () => {
    expect(validarInvitacion("no-es-mail", "", EQUIPO_INICIAL)).toBe("Ingresá un email válido");
    expect(validarInvitacion("carla@empresademo.com", "", EQUIPO_INICIAL)).toBe(
      "Ese email ya es miembro del equipo",
    );
    expect(validarInvitacion("nuevo@x.com", "", EQUIPO_INICIAL)).toBe(
      "Ingresá el nombre del miembro",
    );
    expect(validarInvitacion("nuevo@x.com", "Juan", EQUIPO_INICIAL)).toBeNull();
  });
});

describe("tiempoCustomValido", () => {
  it("al menos 1 minuto", () => {
    expect(tiempoCustomValido("")).toBe(false);
    expect(tiempoCustomValido("0")).toBe(false);
    expect(tiempoCustomValido("15")).toBe(true);
  });
});

describe("mfaActivo", () => {
  it("activo solo con un factor verificado", () => {
    expect(mfaActivo([])).toBe(false);
    expect(mfaActivo([{ status: "unverified" }])).toBe(false);
    expect(mfaActivo([{ status: "unverified" }, { status: "verified" }])).toBe(true);
  });
});

describe("tiempo de sesión", () => {
  it("'Nunca' es una opción seleccionable (el estado guarda la opción tal cual)", () => {
    expect(OPCIONES_TIEMPO_SESION).toContain(SIN_EXPIRACION);
  });
});
