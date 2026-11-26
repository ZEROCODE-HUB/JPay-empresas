import { describe, expect, it } from "vitest";
import { DataAccessError, sinProveedores } from "./errors";

describe("sinProveedores", () => {
  it("no toca los mensajes que no nombran a un proveedor", () => {
    expect(sinProveedores("Saldo insuficiente")).toBe("Saldo insuficiente");
    // «cobre» en minúscula es un verbo, no el proveedor.
    expect(sinProveedores("Espera a que se cobre el link")).toBe("Espera a que se cobre el link");
  });

  it("quita el nombre del procesador de pagos", () => {
    expect(sinProveedores("No se pudo consultar Ecart Pay: timeout")).toBe(
      "No se pudo consultar el procesador de pagos: timeout",
    );
    expect(sinProveedores("La pasarela de EcartPay está apagada")).toBe(
      "La pasarela del procesador de pagos está apagada",
    );
  });

  it("quita el nombre del proveedor de transferencias", () => {
    expect(sinProveedores("Cobre no aceptó la operación")).toBe(
      "El proveedor de transferencias no aceptó la operación",
    );
    expect(sinProveedores("Esa cuenta de Cobre ya está vinculada")).toBe(
      "Esa cuenta del proveedor de transferencias ya está vinculada",
    );
  });

  it("DataAccessError guarda el mensaje ya neutralizado", () => {
    expect(new DataAccessError(new Error("Falta el cliente en Ecart Pay")).message).toBe(
      "Falta el cliente en el procesador de pagos",
    );
  });
});
