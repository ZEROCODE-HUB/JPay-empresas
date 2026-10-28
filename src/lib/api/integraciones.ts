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

export type CobroProveedor = {
  id: string;
  creadoAt: string;
  pagadoAt: string | null;
  metodo: string | null;
  estado: string;
  monto: number;
  reembolsado: number;
  comision: number | null;
  pagador: string | null;
  motivo: string | null;
  /** Contracargo abierto o resuelto sobre este cobro (el más reciente). */
  contracargo: { estado: string; venceAt: string | null } | null;
};

/** Cobros del comercio con Ecart Pay (RLS: solo los propios), los más recientes primero. */
export async function listCobrosEcartPay(limite = 50): Promise<CobroProveedor[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("pagos")
    .select(
      "id, created_at, pagado_at, metodo, estado, monto, monto_reembolsado, comision_proveedor, pagador_nombre, pagador_email, motivo",
    )
    .eq("proveedor", "ecartpay")
    .neq("estado", "error")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new DataAccessError(error);
  const ids = (data ?? []).map((p) => p.id);
  const { data: cb } = ids.length
    ? await sb
        .from("contracargos_proveedor")
        .select("pago_id, estado, vence_at, updated_at")
        .in("pago_id", ids)
        .order("updated_at", { ascending: false })
    : { data: [] };
  const contracargo = new Map<string, { estado: string; venceAt: string | null }>();
  for (const c of cb ?? []) {
    if (c.pago_id && !contracargo.has(c.pago_id)) {
      contracargo.set(c.pago_id, { estado: c.estado, venceAt: c.vence_at });
    }
  }
  return (data ?? []).map((p) => ({
    id: p.id,
    creadoAt: p.created_at,
    pagadoAt: p.pagado_at,
    metodo: p.metodo,
    estado: p.estado,
    monto: Number(p.monto),
    reembolsado: Number(p.monto_reembolsado ?? 0),
    comision: p.comision_proveedor != null ? Number(p.comision_proveedor) : null,
    pagador: p.pagador_nombre ?? p.pagador_email,
    motivo: p.motivo,
    contracargo: contracargo.get(p.id) ?? null,
  }));
}

export type MotivoReembolso = "requested" | "duplicate" | "fraudulent";

/** Pide un reembolso (Edge Function `ecartpay-reembolsos`). */
export async function reembolsarCobro(v: {
  pagoId: string;
  monto: number;
  motivo: MotivoReembolso;
  nota?: string;
}): Promise<{ estado_pago: string | null }> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<{ estado_pago: string | null }>(
    "ecartpay-reembolsos",
    { body: { pago_id: v.pagoId, monto: v.monto, motivo: v.motivo, nota: v.nota } },
  );
  if (error) throw await errorDeFuncion(error);
  return data ?? { estado_pago: null };
}

/** Solo los pagos con tarjeta se reembolsan desde JPay (SPEI no admite y OXXO es efectivo). */
export const esReembolsable = (c: CobroProveedor) =>
  (c.estado === "pagado" || c.estado === "parcialmente_reembolsado") &&
  c.metodo !== "spei" &&
  c.metodo !== "oxxo" &&
  c.monto - c.reembolsado > 0;
