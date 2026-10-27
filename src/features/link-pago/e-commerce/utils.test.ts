import { describe, expect, it } from "vitest";
import type { IntegracionEcommerceRow } from "@/lib/api/links-pago";
import { formatDateTime } from "@/shared/format";
import { conEstadoLocal, ECOMS, mergeIntegraciones, rangoPagina } from "./utils";

const fila = (p: Partial<IntegracionEcommerceRow>): IntegracionEcommerceRow => ({
  id: "i1",
  cliente_legajo: "L1",
  plataforma: "shopify",
  estado: "Deshabilitado",
  created_at: "2026-10-01T12:00:00Z",
  api_key: null,
  webhook_url: null,
  ...p,
});

describe("mergeIntegraciones", () => {
  it("deja el catálogo igual sin integraciones guardadas", () => {
    expect(mergeIntegraciones(ECOMS, [])).toEqual(ECOMS);
  });
  it("pisa estado y fecha con la fila guardada", () => {
    const [shopify, woo] = mergeIntegraciones(ECOMS, [fila({})]);
    expect(shopify.estado).toBe("Deshabilitado");
    expect(shopify.created).toBe(formatDateTime("2026-10-01T12:00:00Z"));
    expect(woo).toEqual(ECOMS[1]);
  });
  it("conserva la fecha del catálogo si la fila no tiene created_at", () => {
    const [shopify] = mergeIntegraciones(ECOMS, [fila({ created_at: "" })]);
    expect(shopify.created).toBe(ECOMS[0].created);
  });
});

describe("conEstadoLocal", () => {
  it("actualiza la fila existente", () => {
    const res = conEstadoLocal([fila({})], "shopify", "Habilitado", "L1");
    expect(res).toHaveLength(1);
    expect(res[0].estado).toBe("Habilitado");
  });
  it("agrega una fila vacía si no existe", () => {
    const res = conEstadoLocal([], "magento", "Habilitado", "L9");
    expect(res).toEqual([
      {
        id: "",
        cliente_legajo: "L9",
        plataforma: "magento",
        estado: "Habilitado",
        created_at: "",
        api_key: null,
        webhook_url: null,
      },
    ]);
  });
});

describe("rangoPagina", () => {
  it("calcula desde/hasta", () => {
    expect(rangoPagina(0, 10, 12)).toEqual({ desde: "1", hasta: 10 });
    expect(rangoPagina(1, 10, 12)).toEqual({ desde: "11", hasta: 12 });
  });
  it("muestra 0 sin filas", () => {
    expect(rangoPagina(0, 10, 0)).toEqual({ desde: "0", hasta: 0 });
  });
});
