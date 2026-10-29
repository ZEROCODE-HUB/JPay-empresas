import { requireSupabase } from "@/lib/supabase";
import { DataAccessError } from "./errors";

/**
 * Checkout público con Cobre (Edge Function `cobre-r2p`): pago por SPEI con una CLABE de un solo
 * uso (Direct Link R2P). El estado lo cambian los avisos de Cobre; el navegador solo consulta.
 */

export type PagoCobre = {
  pago_id: string;
  clabe: string | null;
  vence_at: string | null;
  monto: number;
  estado: string;
  aviso?: string | null;
};

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<T>("cobre-r2p", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo =
      ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new DataAccessError(cuerpo?.error ? new Error(cuerpo.error) : error);
  }
  return data as T;
}

/** ¿El comercio del link puede cobrar por SPEI con Cobre? */
export const infoCobre = (code: string) =>
  invocar<{ disponible: boolean }>({ accion: "info", code });

export const crearPagoCobre = (input: {
  code: string;
  idempotencyKey: string;
  monto: number;
  nombre: string;
  idNumero: string;
  email: string;
}) =>
  invocar<PagoCobre>({
    accion: "checkout",
    code: input.code,
    idempotency_key: input.idempotencyKey,
    monto: input.monto,
    pagador: { nombre: input.nombre, id_numero: input.idNumero, correo: input.email },
  });

export const estadoPagoCobre = (pagoId: string) =>
  invocar<PagoCobre>({ accion: "estado", pago_id: pagoId });
