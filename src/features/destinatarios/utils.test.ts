import { describe, expect, it } from "vitest";
import type { FrequentRecipient } from "@/lib/api/transferencias";
import { aDestinatario } from "./utils";

const base: FrequentRecipient = {
  id: "d1",
  nombre: "Proveedor SA",
  cuit: "30-12345678-9",
  alias: "proveedor.sa",
  cbu: "0000003100000000000001",
  banco: "Banco X",
  creadoEn: "2026-10-01T10:00:00Z",
};

describe("aDestinatario", () => {
  it("mapea la fila de la agenda a la fila de la tabla", () => {
    expect(aDestinatario(base)).toEqual({
      id: "d1",
      n: "Proveedor SA",
      a: "proveedor.sa",
      cbu: "0000003100000000000001",
      b: "Banco X",
      fav: false,
      creadoEn: "2026-10-01T10:00:00Z",
    });
  });
  it("usa vacío sin alias y — sin banco", () => {
    const d = aDestinatario({ ...base, alias: "", banco: "" });
    expect(d.a).toBe("");
    expect(d.b).toBe("—");
  });
});
