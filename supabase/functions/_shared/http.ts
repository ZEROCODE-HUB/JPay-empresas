// Utilidades HTTP comunes a todas las Edge Functions (CORS, respuestas JSON, clientes Supabase).
// Archivo compartido: idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

/** Respuesta al preflight de CORS, o null si no es un OPTIONS. */
export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: CORS }) : null;
}

/** Error con status HTTP: `handler` lo convierte en `json({ error }, status)`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Envuelve el handler: responde el preflight y convierte los errores en JSON
 * (HttpError con su status; cualquier otro, 500 con su mensaje).
 */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const pre = preflight(req);
    if (pre) return pre;
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      const message = e instanceof Error ? e.message : String(e);
      return json({ error: message || "Error inesperado" }, 500);
    }
  };
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, "Falta configuración del servidor");
  return v;
}

/** Cliente con service role (salta RLS): solo para operaciones del servidor. */
export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cliente que actúa como el usuario del request (respeta RLS). */
export function userClient(req: Request): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** JWT del header Authorization, o null. */
export function bearerToken(req: Request): string | null {
  const t = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return t || null;
}

/** Body JSON del request; 400 si no es JSON válido. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Body inválido");
  }
}
