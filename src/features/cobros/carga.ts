import type { MedioPago, RegistroDeLote } from "@/lib/api/cobros-masivos";

/**
 * Parseo y validación del archivo de carga de un lote (CSV o Excel).
 * Funciones puras: la lectura del archivo (FileReader) y los toasts quedan en el hook.
 */

/** Columnas de la plantilla, en orden. */
export const COLUMNAS_PLANTILLA = [
  "tipo_entidad",
  "id_entidad",
  "sub_entidad",
  "identificacion_usuario",
  "monto",
  "descripcion",
  "email",
  "periodo_facturacion",
  "id_unico_beneficiario",
  "fecha_vencimiento_1",
  "fecha_vencimiento_2",
  "fecha_vencimiento_3",
  "tasa_interes",
  "medios_de_pago",
  "pagos_parciales_habilitado",
] as const;

/** Fila validada del archivo de carga. */
export interface FilaCarga {
  tipo_entidad: string;
  id_entidad: string;
  sub_entidad: string;
  identificacion_usuario: string;
  monto: number;
  descripcion: string;
  email?: string;
  periodo_facturacion?: string;
  id_unico_beneficiario?: string;
  fecha_vencimiento_1?: string;
  fecha_vencimiento_2?: string;
  fecha_vencimiento_3?: string;
  tasa_interes?: number;
  medios_de_pago?: string;
  pagos_parciales_habilitado?: string;
}

export type FilaCruda = Record<string, string>;

export type ResultadoCarga = { ok: true; filas: FilaCarga[] } | { ok: false; error: string };

/**
 * Valida las filas crudas (encabezado → valor). Corta en la primera fila inválida
 * y devuelve el mensaje con su número (1-based, sin contar el encabezado).
 */
export function validarFilas(rawRows: FilaCruda[]): ResultadoCarga {
  const filas: FilaCarga[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const monto = parseFloat(row["monto"] || "0");
    if (isNaN(monto) || monto <= 0)
      return { ok: false, error: `Fila ${i + 1}: el monto debe ser un numero positivo` };
    if (!row["tipo_entidad"] || !row["id_entidad"] || !row["sub_entidad"])
      return {
        ok: false,
        error: `Fila ${i + 1}: tipo_entidad, id_entidad y sub_entidad son obligatorios`,
      };
    if (!row["identificacion_usuario"])
      return { ok: false, error: `Fila ${i + 1}: identificacion_usuario es obligatorio` };
    filas.push({
      tipo_entidad: row["tipo_entidad"],
      id_entidad: row["id_entidad"],
      sub_entidad: row["sub_entidad"],
      identificacion_usuario: row["identificacion_usuario"],
      monto,
      descripcion: row["descripcion"] || "",
      email: row["email"] || undefined,
      periodo_facturacion: row["periodo_facturacion"] || undefined,
      id_unico_beneficiario: row["id_unico_beneficiario"] || undefined,
      fecha_vencimiento_1: row["fecha_vencimiento_1"] || undefined,
      fecha_vencimiento_2: row["fecha_vencimiento_2"] || undefined,
      fecha_vencimiento_3: row["fecha_vencimiento_3"] || undefined,
      tasa_interes: row["tasa_interes"] ? parseFloat(row["tasa_interes"]) : undefined,
      medios_de_pago: row["medios_de_pago"] || undefined,
      pagos_parciales_habilitado: row["pagos_parciales_habilitado"] || undefined,
    });
  }
  return { ok: true, filas };
}

/**
 * Convierte el texto de un CSV en filas crudas. Encabezados en minúscula; separa por
 * coma sin soportar comillas (igual que la versión original).
 * Devuelve `null` si no hay al menos encabezado + una fila.
 */
export function csvAFilas(text: string): FilaCruda[] | null {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rawRows: FilaCruda[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: FilaCruda = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rawRows.push(row);
  }
  return rawRows;
}

export const esExcel = (fileName: string): boolean =>
  fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

export const montoTotalFilas = (filas: FilaCarga[]): number =>
  filas.reduce((s, r) => s + r.monto, 0);

/**
 * Arma los registros a guardar a partir de las filas validadas. Los medios de pago y los
 * pagos parciales se toman del lote (las columnas homónimas del archivo no se usan).
 */
export function filasARegistros(
  filas: FilaCarga[],
  loteId: string,
  mediosPago: MedioPago[],
  pagosParciales: boolean,
  generarId: () => string,
): Omit<RegistroDeLote, "createdAt">[] {
  return filas.map((row) => ({
    id: generarId(),
    loteId,
    tipoEntidad: row.tipo_entidad,
    idEntidad: row.id_entidad,
    subEntidad: row.sub_entidad,
    identificacionUsuario: row.identificacion_usuario,
    monto: row.monto,
    descripcion: row.descripcion,
    email: row.email ?? null,
    periodoFacturacion: row.periodo_facturacion ?? null,
    idUnicoBeneficiario: row.id_unico_beneficiario ?? null,
    fechaVencimiento1: row.fecha_vencimiento_1 ?? null,
    fechaVencimiento2: row.fecha_vencimiento_2 ?? null,
    fechaVencimiento3: row.fecha_vencimiento_3 ?? null,
    tasaInteres: row.tasa_interes ?? null,
    mediosPago,
    pagosParcialesHabilitado: pagosParciales,
    cbuId: null,
    linkDePago: null,
    estado: "pendiente",
    montoPagado: 0,
    fechaPago: null,
    emailEnviado: false,
  }));
}
