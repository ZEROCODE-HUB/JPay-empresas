import { beforeEach, describe, expect, it, vi } from "vitest";

const TOTAL_FILAS = { n: 0 };
const rangos: Array<[number, number]> = [];
const filtros: Array<[string, string, unknown]> = [];

/** Query builder mínimo de Supabase: encadena y resuelve según la tabla. */
function builder(tabla: string) {
  const b: Record<string, unknown> = {};
  const chain = (nombre: string) => (col: string, val: unknown) => {
    filtros.push([nombre, col, val]);
    return b;
  };
  for (const m of ["select", "order", "gte", "lte", "in", "or", "ilike"]) b[m] = () => b;
  b.eq = chain("eq");
  b.maybeSingle = async () => ({ data: { legajo: "L1", nombre: "Cli" }, error: null });
  b.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve({ data: [{ id: "s1", nombre: "Caja", cbu: null }], error: null }).then(ok);
  b.range = async (from: number, to: number) => {
    rangos.push([from, to]);
    // Simula un `max-rows` de 1000 en el servidor.
    const fin = Math.min(to, from + 999, TOTAL_FILAS.n - 1);
    const data = [];
    for (let i = from; i <= fin; i++) data.push({ line_id: `${tabla}-${i}` });
    return { data, error: null };
  };
  return b;
}

vi.mock("@/lib/supabase", () => ({
  requireSupabase: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock("@/lib/api/cuenta", () => ({ emailSesion: async () => "a@b.co" }));

const { getHistorialExportacion } = await import("@/lib/api/movimientos");

const f = {
  desde: "",
  hasta: "",
  tipos: null,
  tipoLinea: null,
  subcuenta: "Caja",
  cbu: "",
  cuit: "",
  txid: "",
  titular: "",
};

describe("getHistorialExportacion", () => {
  beforeEach(() => {
    rangos.length = 0;
    filtros.length = 0;
  });

  it("trae todas las filas filtradas en lotes, no solo una página", async () => {
    TOTAL_FILAS.n = 2500;
    const res = await getHistorialExportacion(f);
    expect(res.lineas).toHaveLength(2500);
    expect(res.truncado).toBe(false);
    expect(rangos.slice(0, 3)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    // Aplica el filtro de subcuenta por `subaccount_id`.
    expect(filtros).toContainEqual(["eq", "subaccount_id", "s1"]);
  });

  it("corta en el tope e informa que quedó truncado", async () => {
    TOTAL_FILAS.n = 50;
    const res = await getHistorialExportacion(f, 20);
    expect(res.lineas).toHaveLength(20);
    expect(res.truncado).toBe(true);

    TOTAL_FILAS.n = 20;
    const exacto = await getHistorialExportacion(f, 20);
    expect(exacto.lineas).toHaveLength(20);
    expect(exacto.truncado).toBe(false);
  });
});
