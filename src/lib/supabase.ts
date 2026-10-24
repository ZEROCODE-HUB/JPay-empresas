import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const isSupabaseConfigured = supabase !== null;

/**
 * Devuelve el cliente de Supabase o lanza un error claro si no está configurado.
 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase no está configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el entorno.",
    );
  }
  return supabase;
}

const PERMISSION_PATTERNS: RegExp[] = [
  /permission denied/i,
  /insufficient privilege/i,
  /row-level security/i,
  /new row violates row-level security/i,
  /42501/,
];

export type SupabaseDataError = {
  code: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
};

export function toDataError(err: unknown): SupabaseDataError {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as {
      code?: string | null;
      message?: string;
      details?: string | null;
      hint?: string | null;
    };
    return {
      code: e.code ?? null,
      message: e.message ?? "Error desconocido",
      details: e.details ?? null,
      hint: e.hint ?? null,
    };
  }
  return { code: null, message: String(err) };
}

export function isPermissionError(err: unknown): boolean {
  const e = toDataError(err);
  if (e.code === "42501") return true;
  return PERMISSION_PATTERNS.some((p) => p.test(e.message));
}

/**
 * Las Edge Functions devuelven la causa real en el BODY de la respuesta, pero
 * `functions.invoke` sólo expone el genérico "Edge Function returned a non-2xx
 * status code". Esto lo recupera para que el toast muestre el motivo verdadero
 * (por ejemplo, el rechazo de Resend cuando el dominio no está verificado).
 */
export async function extraerMensajeEdgeFunction(err: unknown): Promise<string | null> {
  if (!err || typeof err !== "object") return null;
  const res = (err as { context?: unknown }).context as Response | undefined;
  if (!res || typeof res.text !== "function") return null;

  try {
    const texto = await res.text();
    if (!texto) return null;

    let cuerpo: unknown = texto;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      // no es JSON: se muestra tal cual
    }

    const obj = (typeof cuerpo === "object" && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>;
    const mensaje =
      typeof obj.error === "string"
        ? obj.error
        : typeof obj.message === "string"
          ? obj.message
          : typeof cuerpo === "string"
            ? cuerpo
            : null;

    if (!mensaje) return texto.slice(0, 400);
    if (/testing emails to your own email|verify a domain/i.test(mensaje)) {
      return "No se pudo enviar el correo de verificación: Resend no tiene un dominio verificado y sólo permite enviar a la dirección de la cuenta. Verificá el dominio en resend.com/domains y ajustá RESEND_FROM.";
    }
    return mensaje;
  } catch {
    return null;
  }
}

export function isNotConfiguredError(err: unknown): boolean {
  return /Supabase no está configurado/i.test(toDataError(err).message);
}

/**
 * Genera URLs firmadas para documentos del bucket `kyc` usando una Edge Function
 * con service role (la firma en el navegador puede fallar por CORS / scope del
 * token de sesión). Verifica que cada documento pertenezca al usuario autenticado
 * (o sea admin). Se firman todos los paths en una sola llamada.
 */
export async function getSignedDocUrls(paths: string[]): Promise<Record<string, string | null>> {
  if (!supabaseUrl || !supabaseAnonKey || paths.length === 0) return {};
  const sb = requireSupabase();
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return {};
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/doc-url`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ paths }),
    });
    const j = await res.json();
    return j.urls ?? {};
  } catch {
    return {};
  }
}

export async function getSignedDocUrl(path: string): Promise<string | null> {
  const map = await getSignedDocUrls([path]);
  return map[path] ?? null;
}

const ERROR_MESSAGES: [RegExp, string][] = [
  [/invalid login credentials|invalid credentials/i, "Usuario o contraseña incorrectos."],
  [/email not confirmed/i, "El correo aún no está confirmado. Revisá tu bandeja de entrada y confirmá tu email para poder ingresar."],
  [/user not found/i, "No existe una cuenta con ese correo."],
  [/user already registered|already exists|already been registered/i, "Ya existe una cuenta con ese correo."],
  [/too many requests|rate limit|too many.*requests/i, "Demasiados intentos fallidos. Esperá unos minutos y volvé a intentar."],
  [/invalid email/i, "Ingresá un correo electrónico válido."],
  [/network|fetch failed|failed to fetch/i, "No se pudo conectar. Verificá tu conexión e intentá de nuevo."],
  [/email.*not.*confirmed|confirm.*email/i, "El correo aún no está confirmado. Revisá tu bandeja de entrada."],
  [/confirmation.*expired|token.*expired|expired/i, "El enlace expiró o ya no es válido. Solicitalo nuevamente."],
  [/invalid.*token|token.*invalid/i, "El enlace no es válido. Solicitalo nuevamente."],
];

export function getAuthErrorMessage(message: string): string {
  for (const [pattern, friendly] of ERROR_MESSAGES) {
    if (pattern.test(message)) return friendly;
  }
  return "No se pudo iniciar sesión. Intentalo nuevamente.";
}