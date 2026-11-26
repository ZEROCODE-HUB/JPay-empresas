// Edge Function: reenvía el email de verificación de correo.
import type { SupabaseClient, User } from "jsr:@supabase/supabase-js@2";
import { handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";
import { avisarCuentaExistente, sendEmail, verificationEmail } from "../_shared/email.ts";

Deno.serve(
  handler(async (req) => {
    const sb = serviceClient();
    const { email } = await readJson<{ email?: string }>(req);
    if (!email) throw new HttpError(400, "Falta el correo");

    // La respuesta es la misma exista o no la cuenta (y esté o no verificada): así esta función
    // no sirve para averiguar qué correos están registrados.
    const user = await buscarUsuarioPorEmail(sb, email);
    if (!user) return json({ ok: true, email });
    const nombre: string =
      `${user.user_metadata?.nombre || ""} ${user.user_metadata?.apellido || ""}`.trim();

    if (user.email_confirmed_at) {
      // Ya verificada: solo se le avisa al dueño del correo.
      await avisarCuentaExistente(sb, email);
      return json({ ok: true, email });
    }
    // Tope: 3 reenvíos cada 10 minutos por cuenta (cada uno manda un correo).
    const { count } = await sb
      .from("verificaciones_correo")
      .select("token", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
    if ((count ?? 0) >= 3) {
      throw new HttpError(
        429,
        "Ya te enviamos varios correos. Espera unos minutos y revisa tu spam.",
      );
    }

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const { error: tErr } = await sb.from("verificaciones_correo").insert({
      token,
      user_id: user.id,
      correo: email,
      expires_at: expires,
    });
    if (tErr) throw new HttpError(400, tErr.message);

    try {
      const sent = await sendEmail(verificationEmail(email, nombre, token));
      return json({ ok: true, email, ...(sent ? {} : { demo_token: token }) });
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "No se pudo enviar el correo");
    }
  }),
);

// supabase-js v2 no tiene getUserByEmail: se recorre el listado de usuarios por páginas.
async function buscarUsuarioPorEmail(sb: SupabaseClient, email: string): Promise<User | null> {
  const buscado = email.trim().toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(500, error.message);
    const user = data.users.find((u) => u.email?.toLowerCase() === buscado);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}
