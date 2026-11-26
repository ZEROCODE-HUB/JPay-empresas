import { isNotConfiguredError, isPermissionError, toDataError } from "@/lib/supabase";

/**
 * El cliente no debe ver los nombres de los proveedores de la plataforma. Los mensajes que llegan
 * del servidor (o que reenvían lo que respondió un proveedor) se neutralizan antes de mostrarse:
 * es una red de seguridad, además de redactarlos sin nombres en el servidor.
 * («cobre» en minúscula es un verbo y no se toca.)
 */
export function sinProveedores(mensaje: string): string {
  const m = mensaje
    .replace(/\bde\s+Ecart\s?Pay\b/gi, "del procesador de pagos")
    .replace(/\ba\s+Ecart\s?Pay\b/gi, "al procesador de pagos")
    .replace(/\bEcart\s?Pay\b/gi, "el procesador de pagos")
    .replace(/\bde\s+Cobre\b/g, "del proveedor de transferencias")
    .replace(/\ba\s+Cobre\b/g, "al proveedor de transferencias")
    .replace(/\bCobre\b/g, "el proveedor de transferencias");
  return m === mensaje ? mensaje : m.charAt(0).toUpperCase() + m.slice(1);
}

/**
 * Error tipado de la capa de acceso a datos. Distingue tres situaciones que la UI
 * debe tratar de forma diferente:
 *  - `permission`: la consulta fue bloqueada por RLS / política (≠ "no hay datos").
 *  - `notConfigured`: Supabase no está configurado en el entorno.
 *  - error genérico de red / Postgres.
 */
export class DataAccessError extends Error {
  permission: boolean;
  notConfigured: boolean;
  code: string | null;
  details: string | null;

  constructor(err: unknown) {
    const e = toDataError(err);
    super(sinProveedores(e.message));
    this.name = "DataAccessError";
    this.code = e.code;
    this.details = e.details ?? null;
    this.permission = isPermissionError(err);
    this.notConfigured = isNotConfiguredError(err);
  }
}
