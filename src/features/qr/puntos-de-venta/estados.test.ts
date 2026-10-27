import { describe, expect, it } from "vitest";
import { ESTADO_ALTA_PDV, estadoAGuardar } from "./estados";

describe("estadoAGuardar", () => {
  it("el alta siempre queda Pendiente de aprobación, sin importar el formulario", () => {
    expect(ESTADO_ALTA_PDV).toBe("Pendiente de aprobación");
    expect(estadoAGuardar(null, "Activado")).toBe("Pendiente de aprobación");
    expect(estadoAGuardar(null, "Desactivado")).toBe("Pendiente de aprobación");
  });

  it("en la edición conserva el estado elegido", () => {
    expect(estadoAGuardar("pdv-1", "Desactivado")).toBe("Desactivado");
    expect(estadoAGuardar("pdv-1", "Activado")).toBe("Activado");
  });
});
