import { describe, expect, it } from "vitest";
import { toConexion } from "./integraciones";

describe("toConexion", () => {
  it("sin fila: sin conectar", () => {
    expect(toConexion("c1", null)).toMatchObject({
      comercioId: "c1",
      estado: "sin_conectar",
      scopes: [],
      publicId: null,
    });
  });

  it("mapea la fila de comercio_proveedores", () => {
    const c = toConexion("c1", {
      comercio_id: "c1",
      estado: "conectado",
      entorno: "sandbox",
      cuenta_externa_id: "acc",
      public_id: "pub",
      scopes: ["read_orders"],
      conectado_at: "2026-10-27T10:00:00Z",
      revocado_at: null,
      ultimo_error: null,
    });
    expect(c).toMatchObject({ estado: "conectado", entorno: "sandbox", cuentaExternaId: "acc" });
  });
});
