import { describe, expect, it } from "vitest";
import type { RegistroDeLote } from "@/lib/api/cobros-masivos";
import { filasRegistrosExcel } from "./export";

const reg = (estado: RegistroDeLote["estado"]): RegistroDeLote => ({
  id: "REG-1",
  loteId: "LOT-1",
  tipoEntidad: "edificio",
  idEntidad: "6",
  subEntidad: "UF 3D",
  identificacionUsuario: "Perez Juan",
  monto: 100,
  descripcion: "Expensas",
  email: null,
  periodoFacturacion: null,
  idUnicoBeneficiario: null,
  fechaVencimiento1: null,
  fechaVencimiento2: null,
  fechaVencimiento3: null,
  tasaInteres: null,
  mediosPago: null,
  pagosParcialesHabilitado: null,
  cbuId: null,
  linkDePago: null,
  estado,
  montoPagado: 0,
  fechaPago: null,
  createdAt: "2026-10-01 10:00:00",
  emailEnviado: false,
});

describe("filasRegistrosExcel", () => {
  it("exporta el estado con su etiqueta legible, no el código crudo", () => {
    const filas = filasRegistrosExcel([reg("pagado_parcial"), reg("pendiente")]);
    expect(filas.map((f) => f.Estado)).not.toContain("pagado_parcial");
    expect(filas[0].Estado).toBe("Pago parcial");
    expect(filas[1].Estado).not.toBe("pendiente");
  });
});
