import type { User } from "@supabase/supabase-js";
import { requireSupabase } from "@/lib/supabase";

/** Usuario autenticado de la sesión actual (o null si no hay sesión). */
export async function getUsuarioActual(): Promise<User | null> {
  const sb = requireSupabase();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

/** Correo del usuario autenticado (o null). */
export async function getEmailUsuarioActual(): Promise<string | null> {
  const user = await getUsuarioActual();
  return user?.email ?? null;
}

export async function iniciarSesion(email: string, password: string) {
  const sb = requireSupabase();
  return sb.auth.signInWithPassword({ email, password });
}

/**
 * Cambia la contraseña del usuario de la sesión. Antes re-autentica con la
 * contraseña actual; lanza un Error con mensaje para mostrar si algo falla.
 */
export async function cambiarPassword(actual: string, nueva: string): Promise<void> {
  const sb = requireSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) throw new Error("Sesión inválida");
  const { error: reErr } = await sb.auth.signInWithPassword({
    email: user.email,
    password: actual,
  });
  if (reErr) throw new Error("La contraseña actual es incorrecta");
  const { error } = await sb.auth.updateUser({ password: nueva });
  if (error) throw error;
}

/** Inicia el alta de un factor TOTP (devuelve el QR y la clave para la app). */
export async function enrolarTotp(): Promise<{ factorId: string; qr: string; secret: string }> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp" });
  if (error) throw error;
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifica el código TOTP del factor recién enrolado (challenge + verify). */
export async function verificarTotp(factorId: string, code: string): Promise<void> {
  const sb = requireSupabase();
  const { data: chal, error: cErr } = await sb.auth.mfa.challenge({ factorId });
  if (cErr) throw cErr;
  const { error } = await sb.auth.mfa.verify({ factorId, challengeId: chal.id, code });
  if (error) throw error;
}

export type FactorMfa = { id: string; factor_type: string; status: string };

/** Factores MFA del usuario de la sesión (verificados o no). */
export async function listarFactoresMfa(): Promise<FactorMfa[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.all ?? []).map((f) => ({
    id: f.id,
    factor_type: f.factor_type,
    status: f.status,
  }));
}

/** Cierra la sesión actual o, con `global`, todas las sesiones del usuario. */
export async function cerrarSesion(scope?: "global"): Promise<void> {
  const sb = requireSupabase();
  await (scope ? sb.auth.signOut({ scope }) : sb.auth.signOut());
}

/**
 * Invitación a un miembro del equipo: envía un magic link (OTP) que crea el
 * usuario si no existe. No requiere permisos de admin.
 */
export async function enviarInvitacion(email: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}
