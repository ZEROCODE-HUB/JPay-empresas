import { describe, expect, it } from "vitest";
import { setPaisActivo } from "@/shared/pais";
import type { Scheduled, Template } from "@/lib/api/transferencias";
import {
  bancoConCodigo,
  comprobanteDe,
  digitsOnly,
  filtrarDestinatarios,
  mensajeEjecucionFallida,
  mensajeValidacionFallida,
  ordenarDestinatarios,
  parseMontoPlantilla,
  tipoIdentificador,
  upsertPlantilla,
  upsertProgramada,
  validacionGuardada,
} from "./utils";

describe("digitsOnly", () => {
  it("deja solo dígitos", () => {
    expect(digitsOnly("20-12345678-9")).toBe("20123456789");
    expect(digitsOnly(null)).toBe("");
  });
});

describe("bancoConCodigo", () => {
  it("une banco y código", () => {
    expect(bancoConCodigo("Galicia", "007")).toBe("Galicia (007)");
    expect(bancoConCodigo("Galicia")).toBe("Galicia");
    expect(bancoConCodigo(undefined, "007")).toBe("(007)");
    expect(bancoConCodigo()).toBe("");
  });
});

describe("tipoIdentificador", () => {
  it("distingue alias, CVU y CBU", () => {
    expect(tipoIdentificador("proveedor.sa")).toBe("Alias");
    expect(tipoIdentificador("0000003100099887766112")).toBe("CVU");
    expect(tipoIdentificador("2850590940090418135201")).toBe("CBU");
  });
});

describe("parseMontoPlantilla", () => {
  it("vacío = sin monto", () => {
    expect(parseMontoPlantilla("  ")).toBeUndefined();
  });
  it("acepta el formato del país", () => {
    expect(parseMontoPlantilla("482,000.50")).toBe(482000.5);
    setPaisActivo("AR");
    expect(parseMontoPlantilla("482.000,50")).toBe(482000.5);
    expect(parseMontoPlantilla("482000")).toBe(482000);
  });
  it("rechaza cero, negativos y texto", () => {
    expect(parseMontoPlantilla("0")).toBeNull();
    expect(parseMontoPlantilla("-5")).toBeNull();
    expect(parseMontoPlantilla("abc")).toBeNull();
  });
});

describe("mensajes de error", () => {
  it("validación", () => {
    expect(mensajeValidacionFallida({ status: "invalid_format" })).toBe(
      "Formato inválido: CBU/CVU 22 dígitos o Alias 6-20 caracteres",
    );
    expect(mensajeValidacionFallida({ status: "not_found" })).toBe("Destinatario no encontrado");
    expect(mensajeValidacionFallida({ status: "rejected" })).toBe("Validación rechazada");
    expect(mensajeValidacionFallida({ status: "error", errorMessage: "x" })).toBe("x");
    expect(mensajeValidacionFallida({ status: "timeout" })).toBe(
      "No se pudo validar el destinatario",
    );
  });
  it("ejecución", () => {
    expect(mensajeEjecucionFallida("not_found")).toBe("Destinatario no encontrado");
    expect(mensajeEjecucionFallida("rejected")).toBe("Validación rechazada");
    expect(mensajeEjecucionFallida("timeout")).toBe("Timeout validando destinatario");
    expect(mensajeEjecucionFallida("valid", "Sin saldo")).toBe("Sin saldo");
    expect(mensajeEjecucionFallida("error")).toBe("Validación fallida");
  });
});

describe("comprobanteDe", () => {
  it("null sin transferencia o sin monto", () => {
    expect(comprobanteDe(null, null, "Empresa", "30")).toBeNull();
    expect(comprobanteDe({ txid: "T" }, null, "Empresa", "30")).toBeNull();
  });
  it("arma origen y destino", () => {
    const c = comprobanteDe(
      { txid: "TRF1", monto: 100, origenCbu: "111", destino: "222", fecha: "2026-01-01" },
      { nombre: "Ana", cuit: "27", cbu: "333", alias: "ana.mp", banco: "BDC" },
      "Empresa",
      "30",
    );
    expect(c?.desde).toEqual({ nombre: "Empresa", cuit: "30", cbu: "111" });
    expect(c?.hacia.cbu).toBe("333");
    expect(c?.hacia.alias).toBe("ana.mp");
    expect(c?.fecha).toBe("2026-01-01");
  });
  it("sin titular usa el destino", () => {
    expect(comprobanteDe({ txid: "T", monto: 1, destino: "222" }, null, "E", "30")?.hacia.cbu).toBe(
      "222",
    );
  });
});

describe("validacionGuardada", () => {
  it("marca como válida con el CBU como identificador", () => {
    const v = validacionGuardada("proveedor.sa", {
      nombre: "P",
      cuit: "30",
      alias: "proveedor.sa",
    });
    expect(v.ok).toBe(true);
    expect(v.kind).toBe("ALIAS");
    expect(v.titular?.cbu).toBe("proveedor.sa");
  });
});

describe("upserts", () => {
  const plantilla = (id: string, nombre: string) => ({ id, nombre }) as Template;
  it("plantillas: reemplaza y ordena por nombre", () => {
    const r = upsertPlantilla(
      [plantilla("1", "Sueldos"), plantilla("2", "Alquiler")],
      plantilla("1", "Bonos"),
    );
    expect(r.map((x) => x.nombre)).toEqual(["Alquiler", "Bonos"]);
  });
  const prog = (id: string, fechaISO: string, hora: string) =>
    ({ id, fechaISO, hora }) as Scheduled;
  it("programadas: agrega y ordena por fecha y hora", () => {
    const r = upsertProgramada(
      [prog("a", "2026-02-01", "10:00"), prog("b", "2026-01-01", "09:00")],
      prog("c", "2026-01-01", "08:00"),
    );
    expect(r.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
  it("programadas: reemplaza la existente", () => {
    const r = upsertProgramada(
      [prog("a", "2026-02-01", "10:00")],
      prog("a", "2026-03-01", "10:00"),
    );
    expect(r).toHaveLength(1);
    expect(r[0].fechaISO).toBe("2026-03-01");
  });
});

describe("agenda de destinatarios", () => {
  const items = [
    { nombre: "Zoe Pérez", alias: "zoe.mp", cbu: "0000003100099887766112", creadoEn: "2026-01-01" },
    { nombre: "Ana Gómez", alias: "", cbu: "2850590940090418135201", creadoEn: "2026-03-01" },
    { nombre: "Proveedor SA", alias: "proveedor.sa", cbu: "1430001713000014330015" },
  ];
  it("búsqueda vacía devuelve todo", () => {
    expect(filtrarDestinatarios(items, "  ")).toHaveLength(3);
  });
  it("busca por nombre sin mayúsculas ni acentos", () => {
    expect(filtrarDestinatarios(items, "perez").map((d) => d.nombre)).toEqual(["Zoe Pérez"]);
  });
  it("busca por alias con o sin @", () => {
    expect(filtrarDestinatarios(items, "@proveedor").map((d) => d.nombre)).toEqual([
      "Proveedor SA",
    ]);
  });
  it("busca por CBU parcial", () => {
    expect(filtrarDestinatarios(items, "2850 5909").map((d) => d.nombre)).toEqual(["Ana Gómez"]);
  });
  it("ordena alfabético y por recientes sin mutar", () => {
    expect(ordenarDestinatarios(items, "alfabetico").map((d) => d.nombre)).toEqual([
      "Ana Gómez",
      "Proveedor SA",
      "Zoe Pérez",
    ]);
    expect(ordenarDestinatarios(items, "recientes").map((d) => d.nombre)).toEqual([
      "Ana Gómez",
      "Zoe Pérez",
      "Proveedor SA",
    ]);
    expect(items[0].nombre).toBe("Zoe Pérez");
  });
});
