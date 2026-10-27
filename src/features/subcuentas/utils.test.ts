import { describe, expect, it } from "vitest";
import type { MovimientoSubcuentaRow } from "@/lib/api/subcuentas";
import type { Mov, Sub } from "./types";
import {
  esPool,
  filtrarMovs,
  filtrarSubs,
  fmtLimite,
  generarCvu,
  mapMovimientos,
  parseMontoAr,
  pctSaldo,
  rangoPagina,
  totalesMovs,
  totalesSubs,
} from "./utils";

const sub = (p: Partial<Sub>): Sub => ({
  n: "Sub",
  apellido: "",
  email: "",
  cbu: "",
  tipo: "Operativa",
  e: "Activa",
  disp: 0,
  ret: 0,
  conc: 0,
  ing: "",
  egr: "",
  resp: "",
  lim: "",
  color: "#000",
  retirosHab: true,
  ...p,
});

describe("fmtLimite", () => {
  it("vacío o cero es sin límite", () => {
    expect(fmtLimite("")).toBe("Sin límite");
    expect(fmtLimite("  ")).toBe("Sin límite");
    expect(fmtLimite("0")).toBe("Sin límite");
  });
  it("texto no numérico se muestra tal cual", () => {
    expect(fmtLimite("libre")).toBe("libre");
  });
  it("acepta formato argentino y plano", () => {
    expect(fmtLimite("50.000,00")).toBe(fmtLimite("50000"));
    expect(fmtLimite("50000")).not.toBe("Sin límite");
  });
});

describe("filtrarSubs", () => {
  const subs = [
    sub({ n: "Sucursal Sur", cbu: "111", tipo: "Operativa", e: "Activa" }),
    sub({ n: "Pool", cbu: "222", tipo: "Recaudacion", e: "Pausada" }),
  ];
  it("busca por nombre (sin mayúsculas) o CVU", () => {
    expect(filtrarSubs(subs, "sur", "Todos", "Todos")).toHaveLength(1);
    expect(filtrarSubs(subs, " 222 ", "Todos", "Todos")[0].n).toBe("Pool");
  });
  it("filtra por tipo y estado", () => {
    expect(filtrarSubs(subs, "", "Recaudacion", "Todos")).toHaveLength(1);
    expect(filtrarSubs(subs, "", "Todos", "Activa")[0].n).toBe("Sucursal Sur");
    expect(filtrarSubs(subs, "", "Operativa", "Pausada")).toHaveLength(0);
  });
});

describe("totales y distribución de saldos", () => {
  const subs = [sub({ disp: 300, ret: 100 }), sub({ disp: 600, ret: 0 })];
  it("suma disponible, retenido y total", () => {
    expect(totalesSubs(subs)).toEqual({ total: 1000, disp: 900, ret: 100 });
    expect(totalesSubs([])).toEqual({ total: 0, disp: 0, ret: 0 });
  });
  it("porcentaje con un decimal y 0.0 si no hay saldo", () => {
    expect(pctSaldo(subs[0], 1000)).toBe("40.0");
    expect(pctSaldo(subs[1], 1000)).toBe("60.0");
    expect(pctSaldo(subs[0], 0)).toBe("0.0");
  });
});

describe("esPool / rangoPagina / generarCvu", () => {
  it("solo Recaudación es pool", () => {
    expect(esPool({ tipo: "Recaudacion" })).toBe(true);
    expect(esPool({ tipo: "Sueldos" })).toBe(false);
  });
  it("rango de la página", () => {
    expect(rangoPagina(1, 10, 0)).toBe("0 registros");
    expect(rangoPagina(2, 10, 15)).toBe("11–15 de 15");
  });
  it("CVU de 22 dígitos", () => {
    expect(generarCvu(() => 0)).toMatch(/^\d{22}$/);
    expect(generarCvu(() => 0.999999)).toMatch(/^\d{22}$/);
  });
});

describe("movimientos", () => {
  const rows = [
    {
      tipo: "deposito",
      monto_operacion: 100,
      cvu: "999",
      id_txn: "TX1",
      fecha: "2026-05-01T10:30:00",
    },
    {
      tipo: "retiro",
      monto_operacion: -40,
      cvu: null,
      id_txn: "TX2",
      fecha: "2026-05-02T11:00:00",
    },
  ] as unknown as MovimientoSubcuentaRow[];
  const moves: Mov[] = mapMovimientos(rows, "Marca");

  it("mapea tipo, título, fecha/hora y monto absoluto", () => {
    expect(moves[0]).toMatchObject({
      tipo: "ingreso",
      titulo: "Depósito",
      fecha: "2026-05-01",
      hora: "10:30",
      monto: 100,
      entidad: "Marca",
    });
    expect(moves[1]).toMatchObject({ tipo: "egreso", titulo: "Retiro", cbu: "", monto: 40 });
  });
  it("filtra por tipo y búsqueda", () => {
    expect(filtrarMovs(moves, "egreso", "")).toHaveLength(1);
    expect(filtrarMovs(moves, "todos", "tx1")).toHaveLength(1);
    expect(filtrarMovs(moves, "todos", "marca")).toHaveLength(2);
  });
  it("totaliza depósitos y retiros", () => {
    expect(totalesMovs(moves)).toEqual({ depositos: 100, retiros: 40 });
  });
});

describe("parseMontoAr", () => {
  it("acepta coma decimal y punto de miles (es-AR)", () => {
    expect(parseMontoAr("1,5")).toBe(1.5);
    expect(parseMontoAr("1.234,56")).toBe(1234.56);
    expect(parseMontoAr("1.500")).toBe(1500);
    expect(parseMontoAr("1.234.567")).toBe(1234567);
    expect(parseMontoAr(" $ 2.000,00 ")).toBe(2000);
  });
  it("sin coma, un punto que no separa miles es decimal", () => {
    expect(parseMontoAr("1500")).toBe(1500);
    expect(parseMontoAr("1500.5")).toBe(1500.5);
  });
  it("NaN para texto vacío o inválido", () => {
    expect(parseMontoAr("")).toBeNaN();
    expect(parseMontoAr("abc")).toBeNaN();
    expect(parseMontoAr("1,2,3")).toBeNaN();
    expect(parseMontoAr("12.34,5")).toBeNaN();
  });
  it("fmtLimite usa el mismo parseo", () => {
    expect(fmtLimite("1.500")).toBe(fmtLimite("1500"));
  });
});
