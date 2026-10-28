import { describe, expect, it } from "vitest";
import {
  etiquetaMetodo,
  etiquetaPunto,
  filasDetalleCobros,
  rangoPeriodo,
  toReporteCobros,
} from "./reporte-cobros";

describe("toReporteCobros", () => {
  it("convierte el jsonb de la RPC y tolera números como texto y faltantes", () => {
    const r = toReporteCobros({
      desde: "2026-10-01",
      hasta: "2026-10-31",
      timezone: "America/Mexico_City",
      resumen: { cantidad: 4, cobrado: "600.00", sin_conciliar: 1, contracargos_abiertos: 2 },
      por_dia: [{ fecha: "2026-10-28", cantidad: 4, monto: 600, comision: 0, reembolsado: 0 }],
      por_metodo: [{ metodo: "spei", cantidad: 2, monto: "300.00" }],
      por_sucursal: [{ sucursal_id: null, sucursal: null, caja_id: null, caja: null, cantidad: 4 }],
      por_comercio: [{ comercio_id: "c1", comercio: "Demo", cantidad: 4, monto: 600 }],
      detalle: [{ id: "p1", pagado_at: "2026-10-28T05:00:00Z", monto: "150.00", comision: null }],
    });
    expect(r.resumen).toMatchObject({
      cantidad: 4,
      cobrado: 600,
      sinConciliar: 1,
      contracargosAbiertos: 2,
      reembolsado: 0,
    });
    expect(r.porMetodo[0]).toEqual({
      metodo: "spei",
      cantidad: 2,
      monto: 300,
      comision: 0,
      reembolsado: 0,
    });
    expect(r.porSucursal[0].sucursal).toBeNull();
    expect(r.detalle[0]).toMatchObject({ monto: 150, comision: null, metodo: "card" });
  });

  it("devuelve un reporte vacío ante una respuesta inválida", () => {
    const r = toReporteCobros(null);
    expect(r.resumen.cantidad).toBe(0);
    expect(r.porDia).toEqual([]);
    expect(r.detalle).toEqual([]);
  });
});

describe("rangoPeriodo", () => {
  const hoy = new Date(2026, 9, 28, 15, 30); // 28/10/2026
  it.each([
    ["hoy", "2026-10-28", "2026-10-28"],
    ["7d", "2026-10-22", "2026-10-28"],
    ["30d", "2026-09-29", "2026-10-28"],
    ["mes", "2026-10-01", "2026-10-28"],
    ["mes_anterior", "2026-09-01", "2026-09-30"],
  ] as const)("%s", (p, desde, hasta) => {
    expect(rangoPeriodo(p, hoy)).toEqual({ desde, hasta });
  });

  it("mes anterior cruza el año", () => {
    expect(rangoPeriodo("mes_anterior", new Date(2027, 0, 5))).toEqual({
      desde: "2026-12-01",
      hasta: "2026-12-31",
    });
  });
});

describe("etiquetas y filas", () => {
  it("nombra medios y puntos de cobro", () => {
    expect(etiquetaMetodo("oxxo")).toBe("OXXO");
    expect(etiquetaMetodo(null)).toBe("Tarjeta");
    expect(etiquetaMetodo("wallet")).toBe("wallet");
    expect(etiquetaPunto(null, null)).toBe("En línea (links de pago)");
    expect(etiquetaPunto("Centro", "Caja 1")).toBe("Centro · Caja 1");
  });

  it("arma las filas del detalle con o sin comercio", () => {
    const d = toReporteCobros({
      detalle: [{ id: "p1", pagado_at: "x", comercio: "Demo", metodo: "spei", monto: 10 }],
    }).detalle;
    expect(filasDetalleCobros(d, () => "F")[0]).toEqual({
      Fecha: "F",
      Medio: "SPEI",
      Punto: "En línea (links de pago)",
      Pagador: "",
      Monto: 10,
      Comision: "",
      Neto: "",
      Reembolsado: 0,
      Orden: "",
    });
    expect(filasDetalleCobros(d, () => "F", true)[0]).toHaveProperty("Comercio", "Demo");
  });
});
