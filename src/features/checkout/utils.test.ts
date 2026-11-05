import { describe, expect, it } from "vitest";
import { totalLink } from "./utils";

describe("totalLink", () => {
  it("suma el detalle si tiene productos; si no, usa el monto", () => {
    expect(
      totalLink({
        monto: 999,
        detalle: [
          { producto_nombre: "a", cantidad: 2, precio_unitario: 10 },
          { producto_nombre: "b", cantidad: 1, precio_unitario: 5.5 },
        ],
      }),
    ).toBe(25.5);
    expect(totalLink({ monto: 40, detalle: [] })).toBe(40);
  });
});
