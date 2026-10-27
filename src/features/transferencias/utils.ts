import {
  detectIdentifierKind,
  type RecipientTitular,
  type RecipientValidationResult,
} from "@/lib/recipient-validation";
import type { DatosComprobante } from "@/lib/comprobante";
import type { FrequentRecipient, Scheduled, Template } from "@/lib/api/transferencias";
import type { CoelsaResult, TransferSuccess } from "./types";

/**
 * 2FA (email OTP) para confirmar una transferencia única. Con `false` la
 * transferencia se ejecuta directo al confirmar.
 */
export const OTP_ENABLED: boolean = false;

/** Opciones del selector de concepto (mismo orden en todos los formularios). */
export const CONCEPTOS = ["Pago a proveedor", "Sueldos", "Honorarios", "Servicios", "Devolucion"];
export const CONCEPTO_DEFAULT = "Pago a proveedor";

export const digitsOnly = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/** Badge color per scheduled-transfer status (executed = green). */
export const STATUS_TONE: Record<string, "neutral" | "success" | "warn" | "danger"> = {
  Scheduled: "warn",
  Ejecutada: "success",
  Cancelada: "neutral",
  Error: "danger",
};

/** "Banco (código)" o "" si no hay datos. */
export function bancoConCodigo(banco?: string, codigo?: string): string {
  return [banco, codigo ? `(${codigo})` : ""].filter(Boolean).join(" ");
}

/** Tipo de identificador para mostrar en la ficha del destinatario. */
export function tipoIdentificador(cbu: string): "Alias" | "CVU" | "CBU" {
  if (detectIdentifierKind(cbu) === "ALIAS") return "Alias";
  return cbu.startsWith("000") ? "CVU" : "CBU";
}

/**
 * Datos del comprobante a partir del resultado del envío y del destinatario
 * validado. Devuelve null si todavía no hay una transferencia enviada.
 */
export function comprobanteDe(
  t: TransferSuccess | null,
  titular: RecipientTitular | null | undefined,
  clienteNombre: string,
  clienteCuit: string,
): DatosComprobante | null {
  if (!t || t.monto == null) return null;
  return {
    fecha: t.fecha ?? new Date().toISOString(),
    monto: t.monto,
    concepto: t.concepto,
    comision: t.comision,
    impuesto: t.impuesto,
    estado: t.estado,
    txid: t.txid,
    desde: { nombre: clienteNombre, cuit: clienteCuit, cbu: t.origenCbu ?? "" },
    hacia: {
      nombre: titular?.nombre ?? "",
      cuit: titular?.cuit ?? "",
      cbu: titular?.cbu ?? t.destino ?? "",
      banco: titular?.banco,
      alias: titular?.alias,
      tipoCuenta: titular?.tipoCuenta,
    },
  };
}

/** Mensaje de error cuando la validación del destinatario no es válida. */
export function mensajeValidacionFallida(
  res: Pick<RecipientValidationResult, "status" | "errorMessage">,
): string {
  return res.status === "invalid_format"
    ? "Formato inválido: CBU/CVU 22 dígitos o Alias 6-20 caracteres"
    : res.status === "not_found"
      ? "Destinatario no encontrado"
      : res.status === "rejected"
        ? "Validación rechazada"
        : (res.errorMessage ?? "No se pudo validar el destinatario");
}

/** Mensaje de error cuando `executeTransfer` devuelve `ok: false`. */
export function mensajeEjecucionFallida(
  status: RecipientValidationResult["status"],
  error?: string,
): string {
  return status === "not_found"
    ? "Destinatario no encontrado"
    : status === "rejected"
      ? "Validación rechazada"
      : status === "timeout"
        ? "Timeout validando destinatario"
        : (error ?? "Validación fallida");
}

/** Pasa el titular de una validación al formato de la pantalla. */
export function titularACoelsa(t: RecipientTitular): CoelsaResult {
  return {
    nombre: t.nombre,
    cuit: t.cuit,
    cbu: t.cbu,
    alias: t.alias,
    banco: t.banco,
    bancoCodigo: t.bancoCodigo,
    tipoCuenta: t.tipoCuenta,
    moneda: t.moneda,
    activa: t.activa,
    tipoPersona: t.tipoPersona,
    tipoDoc: t.tipoDoc,
  };
}

/** Validación "ya hecha" a partir de datos guardados (agenda, programada). */
export function validacionGuardada(
  cbu: string,
  titular: Omit<RecipientTitular, "cbu">,
): RecipientValidationResult {
  return {
    status: "valid",
    ok: true,
    kind: detectIdentifierKind(cbu),
    identifier: cbu,
    provider: "bdc",
    titular: { ...titular, cbu },
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Monto escrito en el modal de plantillas ("482.000,50"). Vacío = sin monto;
 * `null` = inválido.
 */
export function parseMontoPlantilla(texto: string): number | undefined | null {
  const t = texto.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  if (!n || Number.isNaN(n) || n <= 0) return null;
  return n;
}

/** Inserta o reemplaza una plantilla y deja la lista ordenada por nombre. */
export function upsertPlantilla(prev: Template[], fila: Template): Template[] {
  return [...prev.filter((x) => x.id !== fila.id), fila].sort((a, b) =>
    a.nombre.localeCompare(b.nombre),
  );
}

/** Inserta o reemplaza una programada y deja la lista ordenada por fecha y hora. */
export function upsertProgramada(prev: Scheduled[], s: Scheduled): Scheduled[] {
  return (
    prev.some((x) => x.id === s.id) ? prev.map((x) => (x.id === s.id ? s : x)) : [s, ...prev]
  ).sort((a, b) => `${a.fechaISO ?? ""}${a.hora}`.localeCompare(`${b.fechaISO ?? ""}${b.hora}`));
}

/* ===== Agenda de destinatarios ===== */

export type OrdenDestinatarios = "recientes" | "alfabetico";

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Filtra por nombre, alias (con o sin "@") o CBU/CVU (ignora espacios y guiones). */
export function filtrarDestinatarios<T extends Pick<FrequentRecipient, "nombre" | "alias" | "cbu">>(
  items: T[],
  busqueda: string,
): T[] {
  const q = normalizar(busqueda.trim()).replace(/^@/, "");
  if (!q) return items;
  const qDigitos = q.replace(/[\s-]/g, "");
  return items.filter(
    (d) =>
      normalizar(d.nombre).includes(q) ||
      normalizar(d.alias).includes(q) ||
      (/^\d+$/.test(qDigitos) && d.cbu.includes(qDigitos)),
  );
}

/** Ordena sin mutar: recientes (alta más nueva primero) o alfabético. */
export function ordenarDestinatarios<T extends Pick<FrequentRecipient, "nombre" | "creadoEn">>(
  items: T[],
  orden: OrdenDestinatarios,
): T[] {
  const copia = [...items];
  if (orden === "alfabetico") return copia.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return copia.sort((a, b) => (b.creadoEn ?? "").localeCompare(a.creadoEn ?? ""));
}
