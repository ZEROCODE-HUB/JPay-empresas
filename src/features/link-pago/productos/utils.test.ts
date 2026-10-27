import { describe, expect, it } from "vitest";
import type { PaymentLink } from "@/data/links-pago";
import type { ComercioBanderaRow } from "@/lib/api/links-pago";
import { toneEstadoLink } from "./estados";
import {
  banderasUnicas,
  codigoLink,
  dmyAIso,
  expiraEnIso,
  linkDisplayStatus,
  methodIdFromBandera,
  montoProductos,
  nuevoCodigoLink,
  paginarLinks,
  parsePrecio,
} from "./utils";

const link = (p: Partial<PaymentLink>): PaymentLink => ({
  id: "id1",
  url: "https://pay.example.com/p/LP-ABC123",
  products: [],
  status: "Activo",
  partialPayments: false,
  methods: [],
  createdAt: "01/10/2026",
  views: 0,
  payments: 0,
  ...p,
});

describe("banderas", () => {
  it("normaliza el texto de la bandera", () => {
    expect(methodIdFromBandera(" Visa Débito ")).toBe("visa-deb");
    expect(methodIdFromBandera("American Express")).toBe("amex");
    expect(methodIdFromBandera("Otra Marca")).toBe("otra_marca");
  });

  it("deduplica por metodo, priorizando metodo_key", () => {
    const rows = [
      { id: "1", bandera: "Visa", metodo_key: null },
      { id: "2", bandera: "Visa Crédito", metodo_key: null },
      { id: "3", bandera: "Master", metodo_key: "mc-cred" },
    ] as unknown as ComercioBanderaRow[];
    expect(banderasUnicas(rows).map((b) => [b.id, b.methodId])).toEqual([
      ["1", "visa-cred"],
      ["3", "mc-cred"],
    ]);
  });
});

describe("estado del link", () => {
  const ahora = new Date("2026-10-15T12:00:00").getTime();

  it("un link activo vencido figura Vencido", () => {
    expect(linkDisplayStatus(link({ expiresAt: "14/10/2026" }), ahora)).toBe("Vencido");
    expect(linkDisplayStatus(link({ expiresAt: "15/10/2026" }), ahora)).toBe("Activo");
    expect(linkDisplayStatus(link({ status: "Inactivo", expiresAt: "01/01/2020" }), ahora)).toBe(
      "Inactivo",
    );
    // Formato ISO (link recién creado): no se interpreta.
    expect(linkDisplayStatus(link({ expiresAt: "2020-01-01" }), ahora)).toBe("Activo");
  });

  it("tono del badge", () => {
    expect(toneEstadoLink("Activo")).toBe("success");
    expect(toneEstadoLink("Inactivo")).toBe("neutral");
    expect(toneEstadoLink("Vencido")).toBe("danger");
    expect(toneEstadoLink("Pendiente de aprobación")).toBe("danger");
  });
});

describe("helpers", () => {
  it("monto, codigo y fechas", () => {
    expect(
      montoProductos([
        { price: 10, qty: 2 },
        { price: 5, qty: 1 },
      ]),
    ).toBe(25);
    expect(codigoLink(link({}))).toBe("LP-ABC123");
    expect(dmyAIso("31/12/2026")).toBe("2026-12-31");
    expect(expiraEnIso("")).toBeNull();
    expect(expiraEnIso("2026-12-31")).toBe(new Date("2026-12-31T23:59:59").toISOString());
    expect(nuevoCodigoLink()).toMatch(/^LP-[0-9A-Z]{1,6}$/);
  });

  it("parsea el precio tomando el punto como separador de miles", () => {
    expect(parsePrecio("29.900")).toBe(29900);
    expect(parsePrecio("29900,50")).toBe(29900.5);
    expect(parsePrecio("$ 1.000")).toBe(1000);
    expect(parsePrecio("abc")).toBe(0);
  });

  it("paginacion acotada", () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(paginarLinks(items, 3, 10)).toEqual({
      items: [20, 21, 22],
      page: 3,
      totalPages: 3,
      total: 23,
    });
    expect(paginarLinks(items, 9, 10).page).toBe(3);
    expect(paginarLinks([], 1, 10)).toEqual({ items: [], page: 1, totalPages: 1, total: 0 });
  });
});
