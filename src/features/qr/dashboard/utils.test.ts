import { describe, expect, it } from "vitest";
import type { DashboardQrDatos } from "@/lib/api/qr";
import { formatMoney } from "@/shared/format";
import { calcularDashboardQr, desdePreset } from "./utils";

const datos: DashboardQrDatos = {
  cobros: [
    { monto_operacion: 1_000_000, estado_id: 1, fecha: "2026-09-10T10:00:00Z" },
    { monto_operacion: 500_000, estado_id: 2, fecha: "2026-10-02T10:00:00Z" },
    { monto_operacion: 250_000, estado_id: 1, fecha: "2026-10-05T10:00:00Z" },
    { monto_operacion: 0, estado_id: 9, fecha: "" },
  ],
  cobrosError: null,
  estados: [
    { id: 1, nombre: "Aprobado" },
    { id: 2, nombre: "Pendiente" },
  ],
  pdvsPorEstado: { Activado: 3, Desactivado: 1 },
};

describe("calcularDashboardQr", () => {
  it("devuelve todo vacío sin datos", () => {
    expect(calcularDashboardQr(null)).toEqual({
      kpis: [],
      statusData: [],
      pdvData: [],
      evolucion: [],
    });
  });

  it("arma los KPIs", () => {
    const { kpis } = calcularDashboardQr(datos);
    expect(kpis.map((k) => [k.label, k.value])).toEqual([
      ["Total cobros QR", "4"],
      ["Monto total recaudado", `${formatMoney(1_750_000, { decimals: 0 })} ARS`],
      ["Transacciones", "2"],
      ["Pendientes", "2"],
      ["PDV activos", "3"],
      ["Tasa de exito", "50.0%"],
    ]);
  });

  it("agrupa por estado (con Desconocido) y por estado de PDV", () => {
    const { statusData, pdvData } = calcularDashboardQr(datos);
    expect(statusData).toEqual([
      { name: "Aprobado", value: 2 },
      { name: "Pendiente", value: 1 },
      { name: "Desconocido", value: 1 },
    ]);
    expect(pdvData).toEqual([
      { name: "Activado", value: 3 },
      { name: "Desactivado", value: 1 },
    ]);
  });

  it("evolución mensual en millones, ordenada y sin filas sin fecha", () => {
    expect(calcularDashboardQr(datos).evolucion).toEqual([
      { mes: "Sep", cobros: 1, monto: 1 },
      { mes: "Oct", cobros: 2, monto: 0.75 },
    ]);
  });

  it("se queda con los últimos 6 meses", () => {
    const cobros = Array.from({ length: 8 }, (_, i) => ({
      monto_operacion: 1,
      estado_id: 1,
      fecha: `2026-0${i + 1}-01`,
    }));
    const ev = calcularDashboardQr({ ...datos, cobros }).evolucion;
    expect(ev.map((e) => e.mes)).toEqual(["Mar", "Abr", "May", "Jun", "Jul", "Ago"]);
  });
});

describe("desdePreset", () => {
  const ahora = new Date(2026, 9, 27, 15, 30);
  it("Hoy arranca a las 00:00 de hoy", () => {
    expect(desdePreset("Hoy", ahora)).toBe(new Date(2026, 9, 27).toISOString());
  });
  it("7 dias incluye hoy", () => {
    expect(desdePreset("7 dias", ahora)).toBe(new Date(2026, 9, 21).toISOString());
  });
  it("preset desconocido usa 30 días", () => {
    expect(desdePreset("x", ahora)).toBe(new Date(2026, 8, 28).toISOString());
  });
});
