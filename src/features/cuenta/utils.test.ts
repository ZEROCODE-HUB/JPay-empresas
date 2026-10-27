import { describe, expect, it } from "vitest";
import type { Cliente, DocumentoCliente } from "@/lib/api/cuenta";
import {
  antiguedad,
  clienteToForm,
  formToPatch,
  kindOf,
  labelKyc,
  mapDocumentos,
  scoreSeguridad,
} from "./utils";

describe("kindOf", () => {
  it("detecta imagen, pdf u otro por extensión", () => {
    expect(kindOf("dni.JPG", "")).toBe("image");
    expect(kindOf("", "a/b/constancia.pdf")).toBe("pdf");
    expect(kindOf("archivo.docx", "")).toBe("file");
  });
});

describe("mapDocumentos", () => {
  it("traduce el tipo y calcula el kind", () => {
    const docs = [
      {
        tipo: "id_frente",
        url: "x/frente.png",
        label: null,
        created_at: "2026-01-01",
        signedUrl: "s",
      },
    ] as unknown as DocumentoCliente[];
    expect(mapDocumentos(docs)[0]).toMatchObject({
      tipo: "DNI Frente",
      rawTipo: "id_frente",
      label: "x/frente.png",
      kind: "image",
      signedUrl: "s",
    });
  });
});

describe("antiguedad", () => {
  const now = new Date(2026, 9, 15);
  it("casos límite", () => {
    expect(antiguedad(null, now)).toBe("—");
    expect(antiguedad(new Date(2026, 9, 1), now)).toBe("Reciente");
    expect(antiguedad(new Date(2026, 4, 1), now)).toBe("5 meses");
    expect(antiguedad(new Date(2025, 9, 1), now)).toBe("1 año");
    expect(antiguedad(new Date(2024, 8, 1), now)).toBe("2 años 1 mes");
    expect(antiguedad(new Date(2023, 6, 1), now)).toBe("3 años 3 meses");
  });
});

describe("scoreSeguridad", () => {
  it("86 sin cliente; suma por aprobado, dirección, teléfono y docs (tope 100)", () => {
    expect(scoreSeguridad(null, false, 0)).toBeNull();
    expect(scoreSeguridad({ direccion: null, telefono: null }, false, 0)).toBe(55);
    expect(scoreSeguridad({ direccion: "x", telefono: "y" }, true, 1)).toBe(93);
    expect(scoreSeguridad({ direccion: "x", telefono: "y" }, true, 10)).toBe(100);
  });
});

describe("labelKyc", () => {
  it("prioriza aprobado", () => {
    expect(labelKyc(true, "rechazado")).toBe("Validado");
    expect(labelKyc(false, "rechazado")).toBe("Rechazado");
    expect(labelKyc(false, null)).toBe("Pendiente");
  });
});

describe("formulario", () => {
  it("separa nombre y apellido y arma el patch", () => {
    const c = { nombre: "Ana María Pérez", cuit: "", es_pep: null } as unknown as Cliente;
    const f = clienteToForm(c);
    expect(f.nombre).toBe("Ana");
    expect(f.apellido).toBe("María Pérez");
    const patch = formToPatch(f);
    expect(patch.nombre).toBe("Ana María Pérez");
    expect(patch.cuit).toBeUndefined();
    expect(patch.direccion).toBeNull();
    expect(patch.es_pep).toBe(false);
  });
});
