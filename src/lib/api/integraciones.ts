import { requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { DataAccessError } from "./errors";

/**
 * Conexión del comercio con proveedores de pago por OAuth (Fase 3 de Ecart Pay).
 * La fila de `comercio_proveedores` la lee el propio comercio por RLS; el alta y la baja pasan
 * por las Edge Functions `ecartpay-oauth-inicio` / `ecartpay-oauth-desconectar`.
 */

export type EstadoConexion = "sin_conectar" | "pendiente" | "conectado" | "revocado" | "error";

export type ConexionProveedor = {
  comercioId: string;
  estado: EstadoConexion;
  entorno: string | null;
  cuentaExternaId: string | null;
  publicId: string | null;
  scopes: string[];
  conectadoAt: string | null;
  revocadoAt: string | null;
  ultimoError: string | null;
};

type Fila = Pick<
  Tables<"comercio_proveedores">,
  | "comercio_id"
  | "estado"
  | "entorno"
  | "cuenta_externa_id"
  | "public_id"
  | "scopes"
  | "conectado_at"
  | "revocado_at"
  | "ultimo_error"
>;

export function toConexion(comercioId: string, r: Fila | null): ConexionProveedor {
  return {
    comercioId,
    estado: (r?.estado as EstadoConexion) ?? "sin_conectar",
    entorno: r?.entorno ?? null,
    cuentaExternaId: r?.cuenta_externa_id ?? null,
    publicId: r?.public_id ?? null,
    scopes: r?.scopes ?? [],
    conectadoAt: r?.conectado_at ?? null,
    revocadoAt: r?.revocado_at ?? null,
    ultimoError: r?.ultimo_error ?? null,
  };
}

/** Conexión con Ecart Pay del comercio (la más reciente, de cualquier entorno). */
export async function getConexionEcartPay(comercioId: string): Promise<ConexionProveedor> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("comercio_proveedores")
    .select(
      "comercio_id, estado, entorno, cuenta_externa_id, public_id, scopes, conectado_at, revocado_at, ultimo_error",
    )
    .eq("comercio_id", comercioId)
    .eq("proveedor", "ecartpay")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  return toConexion(comercioId, data);
}

/** Devuelve la URL de Ecart Pay a la que hay que mandar al usuario para autorizar. */
export async function iniciarConexionEcartPay(comercioId: string): Promise<string> {
  const sb = requireSupabase();
  const volverA = `${window.location.origin}/app/integraciones`;
  const { data, error } = await sb.functions.invoke<{ url: string }>("ecartpay-oauth-inicio", {
    body: { comercio_id: comercioId, volver_a: volverA },
  });
  if (error) throw await errorDeFuncion(error);
  if (!data?.url) throw new DataAccessError(new Error("No se recibió la URL de Ecart Pay"));
  return data.url;
}

export async function desconectarEcartPay(comercioId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.functions.invoke("ecartpay-oauth-desconectar", {
    body: { comercio_id: comercioId },
  });
  if (error) throw await errorDeFuncion(error);
}

/** En errores HTTP de Edge Functions el mensaje útil viene en el cuerpo ({ error }). */
async function errorDeFuncion(error: unknown): Promise<DataAccessError> {
  const ctx = (error as { context?: Response }).context;
  const cuerpo = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
  return new DataAccessError(cuerpo?.error ? new Error(cuerpo.error) : error);
}
