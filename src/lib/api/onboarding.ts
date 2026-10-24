import { requireSupabase } from "@/lib/supabase";

export type OnboardingPayload = {
  email: string;
  tipoCuenta: "fisica" | "juridica";
  nombre: string;
  cuit: string;
  perfil: Record<string, unknown>;
  kyc: Record<string, { name: string; type: string; data: string } | null>;
};

export type OnboardingResult = { ok: boolean; legajo: string; email: string };

export type RegisterPayload = {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  fechaNac: string;
  tipoCuenta: "fisica" | "juridica";
};

export async function registerClient(payload: RegisterPayload): Promise<{ ok: boolean; email: string }> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("registrar-cliente", { body: payload });
  if (error) {
    let message = (error as unknown as { message?: string })?.message || "No se pudo registrar la cuenta";
    // Supabase FunctionsHttpError pone el body real en error.context.json()
    try {
      const ctx = (error as unknown as { context?: unknown }).context as { json?: () => Promise<{ error?: string }> } | undefined;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      } else if (typeof (error as unknown as { context?: { body?: string } }).context?.body === "string") {
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
  return data as { ok: boolean; email: string };
}

export async function verifyEmail(token: string): Promise<{ ok: boolean }> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("verificar-correo", { body: { token } });
  if (error) {
    let msg = error.message || "No se pudo verificar el correo";
    try {
      const ctx = (error as unknown as { context?: unknown }).context as { json?: () => Promise<{ error?: string }> } | undefined;
      if (ctx && typeof ctx.json === "function") {
        const b = await ctx.json();
        if (b?.error) msg = b.error;
      }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { ok: boolean };
}

export async function resendVerification(email: string): Promise<{ ok: boolean; email: string }> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("reenviar-verificacion", { body: { email } });
  if (error) {
    let msg = error.message || "No se pudo reenviar el correo";
    try {
      const ctx = (error as unknown as { context?: unknown }).context as { json?: () => Promise<{ error?: string }> } | undefined;
      if (ctx && typeof ctx.json === "function") {
        const b = await ctx.json();
        if (b?.error) msg = b.error;
      }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { ok: boolean; email: string };
}

export async function submitOnboarding(
  payload: OnboardingPayload,
): Promise<OnboardingResult> {
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
