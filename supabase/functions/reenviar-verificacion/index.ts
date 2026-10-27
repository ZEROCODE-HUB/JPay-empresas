// Edge Function: reenvía el email de verificación de correo.
import type { SupabaseClient, User } from "jsr:@supabase/supabase-js@2";
import { handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";
import { sendEmail, verificationEmail } from "../_shared/email.ts";

Deno.serve(
  handler(async (req) => {
    const sb = serviceClient();
    const { email } = await readJson<{ email?: string }>(req);
    if (!email) throw new HttpError(400, "Falta el correo");

    const user = await buscarUsuarioPorEmail(sb, email);
    if (!user) throw new HttpError(400, "No existe una cuenta con ese correo");
    const nombre: string =
      `${user.user_metadata?.nombre || ""} ${user.user_metadata?.apellido || ""}`.trim();

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
