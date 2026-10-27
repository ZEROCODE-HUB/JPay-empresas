import { getSignedDocUrls, requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { getEmailUsuarioActual } from "./auth";
import { DataAccessError } from "./errors";

export type OnboardingPayload = {
  email: string;
  tipoCuenta: "fisica" | "juridica";
  nombre: string;
  cuit: string;
  perfil: Record<string, unknown>;
  kyc: Record<string, { name: string; type: string; data: string } | null>;
};

export type OnboardingResult = { ok: boolean; legajo: string; email: string };

/**
 * Modo demo: sin Resend configurado, las edges de verificación no envían correo y devuelven
 * `demo_token`. El portal lo guarda por email para mostrar el link de verificación en pantalla.
 */
export type VerificationResult = { ok: boolean; email: string; demo_token?: string };

const DEMO_TOKEN_KEY = "demo_verify_token";

export function rememberDemoToken(email: string, token: string | undefined) {
  if (typeof window === "undefined" || !token) return;
  try {
    sessionStorage.setItem(DEMO_TOKEN_KEY, JSON.stringify({ email, token }));
  } catch {
    /* ignore */
  }
}

export function readDemoVerifyUrl(email: string | null | undefined): string | null {
  if (typeof window === "undefined" || !email) return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(DEMO_TOKEN_KEY) ?? "null") as {
      email: string;
      token: string;
    } | null;
    if (!saved || saved.email !== email) return null;
    return `${window.location.origin}/verificar-correo?token=${encodeURIComponent(saved.token)}`;
  } catch {
    return null;
  }
}

export type RegisterPayload = {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  fechaNac: string;
  tipoCuenta: "fisica" | "juridica";
};

export async function registerClient(payload: RegisterPayload): Promise<VerificationResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("registrar-cliente", { body: payload });
  if (error) {
    let message =
      (error as unknown as { message?: string })?.message || "No se pudo registrar la cuenta";
    // Supabase FunctionsHttpError pone el body real en error.context.json()
    try {
      const ctx = (error as unknown as { context?: unknown }).context as
        { json?: () => Promise<{ error?: string }> } | undefined;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      } else if (
        typeof (error as unknown as { context?: { body?: string } }).context?.body === "string"
      ) {
        const parsed = JSON.parse((error as unknown as { context: { body: string } }).context.body);
        if (parsed?.error) message = parsed.error;
      }
    } catch {
      // ignorar, mantener mensaje genérico
    }
    // Mapear mensaje técnico en inglés a español si aún no fue traducido por la edge
    if (/already.*registered/i.test(message)) message = "Ya existe una cuenta con ese correo.";
    throw new Error(message);
  }
  // La edge puede devolver { error } con 200? (no, pero por si acaso)
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  const result = data as VerificationResult;
  rememberDemoToken(payload.email, result.demo_token);
  return result;
}

export async function verifyEmail(token: string): Promise<{ ok: boolean }> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("verificar-correo", { body: { token } });
  if (error) {
    let msg = error.message || "No se pudo verificar el correo";
    try {
      const ctx = (error as unknown as { context?: unknown }).context as
        { json?: () => Promise<{ error?: string }> } | undefined;
      if (ctx && typeof ctx.json === "function") {
        const b = await ctx.json();
        if (b?.error) msg = b.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { ok: boolean };
}

export async function resendVerification(email: string): Promise<VerificationResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("reenviar-verificacion", {
    body: { email },
  });
  if (error) {
    let msg = error.message || "No se pudo reenviar el correo";
    try {
      const ctx = (error as unknown as { context?: unknown }).context as
        { json?: () => Promise<{ error?: string }> } | undefined;
      if (ctx && typeof ctx.json === "function") {
        const b = await ctx.json();
        if (b?.error) msg = b.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  const result = data as VerificationResult;
  rememberDemoToken(email, result.demo_token);
  return result;
}

export async function submitOnboarding(payload: OnboardingPayload): Promise<OnboardingResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("crear-cliente", {
    body: payload,
  });
  if (error) {
    let message = error.message || "No se pudo enviar el onboarding";
    try {
      const ctx = (error as unknown as { context?: unknown }).context;
      if (ctx && typeof (ctx as { json?: unknown }).json === "function") {
        const body = await (ctx as { json: () => Promise<{ error?: string }> }).json();
        if (body?.error) message = body.error;
      }
    } catch {
      /* ignore: keep generic message */
    }
    throw new Error(message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as OnboardingResult;
}

/** Convierte un File a { name, type, data(base64) } para enviarlo por JSON. */
export function fileToB64(file: File): Promise<{ name: string; type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ name: file.name, type: file.type, data: result });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// Lecturas del cliente para el flujo de onboarding / login
// ============================================================================

type Cliente = Tables<"clientes">;

export type ClienteDatosPersonales = Pick<
  Cliente,
  "genero" | "cuit_cuil" | "ocupacion" | "origen_fondos" | "es_pep"
>;
export type ClienteDatosEmpresa = Pick<
  Cliente,
  "cuit" | "fecha_inscripcion" | "tipo_sociedad" | "nombre_legal" | "nombre_fantasia"
>;
export type ClienteDireccion = Pick<
  Cliente,
  "legajo" | "direccion" | "direccion2" | "ciudad" | "provincia" | "cp"
>;
export type ClienteOnboarding = Pick<Cliente, "legajo" | "estado" | "onboarding_completo">;
export type DocumentoKyc = Pick<Tables<"documentos">, "tipo" | "url" | "label"> & {
  signedUrl: string | null | undefined;
};

export async function getClienteDatosPersonales(
  email: string,
): Promise<ClienteDatosPersonales | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("clientes")
    .select("genero, cuit_cuil, ocupacion, origen_fondos, es_pep")
    .eq("correo", email)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  return data;
}

export async function getClienteDatosEmpresa(email: string): Promise<ClienteDatosEmpresa | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("clientes")
    .select("cuit, fecha_inscripcion, tipo_sociedad, nombre_legal, nombre_fantasia")
    .eq("correo", email)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  return data;
}

export async function getEstadoClientePorCorreo(email: string): Promise<string | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("clientes")
    .select("estado")
    .eq("correo", email)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  return data?.estado ?? null;
}

export async function getTipoPersonaPorCorreo(email: string): Promise<string | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("clientes")
    .select("tipo_persona")
    .eq("correo", email)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  return data?.tipo_persona ?? null;
}

export async function getClienteOnboardingPorCorreo(
  email: string,
): Promise<ClienteOnboarding | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("clientes")
    .select("legajo, estado, onboarding_completo")
    .eq("correo", email)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  return data;
}

/**
 * true si el cliente ya tiene alguna validación o documento cargado.
 * Un error en cualquiera de las dos consultas cuenta como "sin registro" (comportamiento previo).
 */
export async function tieneValidacionODocumento(legajo: string): Promise<boolean> {
  const sb = requireSupabase();
  const { data: val } = await sb
    .from("validaciones")
    .select("id")
    .eq("cliente_legajo", legajo)
    .limit(1)
    .maybeSingle();
  const { data: doc } = await sb
    .from("documentos")
    .select("id")
    .eq("cliente_legajo", legajo)
    .limit(1)
    .maybeSingle();
  return !!val || !!doc;
}

export type EstadoOnboarding = { estado: string | null; hasDocs: boolean | null };

/** Estado del alta del usuario actual para la pantalla "en proceso". */
export async function getEstadoOnboarding(): Promise<EstadoOnboarding> {
  const email = await getEmailUsuarioActual();
  if (!email) return { estado: null, hasDocs: null };
  const sb = requireSupabase();
  const { data: cli, error } = await sb
    .from("clientes")
    .select("estado, onboarding_completo, legajo, tipo_persona")
    .eq("correo", email)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  let hasDocs: boolean | null = null;
  if (cli?.legajo) {
    try {
      hasDocs = await tieneValidacionODocumento(cli.legajo);
    } catch {
      hasDocs = false;
    }
  }
  return { estado: cli?.estado || null, hasDocs };
}

export type PrefillKyc = { cliente: ClienteDireccion | null; documentos: DocumentoKyc[] };

/** Dirección y documentos ya cargados del usuario actual (con URLs firmadas). */
export async function getPrefillKyc(): Promise<PrefillKyc> {
  const email = await getEmailUsuarioActual();
  if (!email) return { cliente: null, documentos: [] };
  const sb = requireSupabase();
  const { data: cli, error } = await sb
    .from("clientes")
    .select("legajo, direccion, direccion2, ciudad, provincia, cp")
    .eq("correo", email)
    .maybeSingle();
  if (error) throw new DataAccessError(error);
  if (!cli) return { cliente: null, documentos: [] };
  // Un error al leer documentos no impide precargar la dirección (comportamiento previo).
  const { data: docs } = await sb
    .from("documentos")
    .select("tipo, url, label")
    .eq("cliente_legajo", cli.legajo);
  if (!docs || docs.length === 0) return { cliente: cli, documentos: [] };
  const urls = await getSignedDocUrls(docs.map((d) => d.url as string));
  return {
    cliente: cli,
    documentos: docs.map((d) => ({ ...d, signedUrl: urls[d.url as string] })),
  };
}
