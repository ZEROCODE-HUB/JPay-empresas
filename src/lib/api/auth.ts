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
