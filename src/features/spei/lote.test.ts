import { describe, expect, it } from "vitest";
import type { DestinatarioSpei } from "@/lib/api/cobre";
import { leerLoteSpei, partirCsv, plantillaLoteSpeiCsv } from "./lote";

const CLABE = "032180000118359719";

describe("partirCsv", () => {
  it("respeta comillas y detecta el separador", () => {
    expect(partirCsv('a,"1,500.00",c\r\nd,e,f\n')).toEqual([
      ["a", "1,500.00", "c"],
      ["d", "e", "f"],
    ]);
    expect(partirCsv("a;1,5;c")).toEqual([["a", "1,5", "c"]]);
    expect(partirCsv('a,"dice ""hola""",c')).toEqual([["a", 'dice "hola"', "c"]]);
  });
});

describe("leerLoteSpei", () => {
  it("la plantilla se lee pero sus filas de ejemplo no se pagan", () => {
    const filas = leerLoteSpei(plantillaLoteSpeiCsv(), []);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.error === "Fila de ejemplo: bórrala")).toBe(true);
  });

  it("lee una fila válida con monto con miles y concepto con coma", () => {
    const dest = { id: "d1", numero: CLABE, idNumero: "GODE561231GR8" } as DestinatarioSpei;
    const [f] = leerLoteSpei(
      `clabe,titular,rfc_o_curp,monto,concepto\n${CLABE},Gerardo,gode561231gr8,"1,500.00","Nómina, marzo"`,
      [dest],
    );
    expect(f).toMatchObject({
      clabe: CLABE,
      idNumero: "GODE561231GR8",
      monto: 1500,
      concepto: "Nómina, marzo",
      error: null,
    });
    expect(f.destinatario?.id).toBe("d1");
  });

  it("marca errores y pone 'Pago' si no hay concepto", () => {
    const filas = leerLoteSpei(`${CLABE};Ana;GODE561231GR8;0\n123;Ana;GODE561231GR8;10`, []);
    expect(filas[0]).toMatchObject({ error: "Monto inválido", concepto: "Pago" });
    expect(filas[1].error).toMatch(/18 dígitos/);
  });
});
