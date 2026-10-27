// Edge Function: envía OTP de 6 dígitos para confirmar transferencia.
// Reutiliza credenciales RESEND_API_KEY y RESEND_FROM ya configuradas.
// Requiere usuario autenticado (Authorization: Bearer <jwt>).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { handler, json } from "../_shared/http.ts";
import { otpEmail, sendEmail } from "../_shared/email.ts";

Deno.serve(
  handler(async (req) => {
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !service) return json({ error: "Falta configuración del servidor" }, 500);

    // Verificar autenticación: extraer JWT del header Authorization
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "No autenticado" }, 401);

    // Crear cliente con service_role para poder validar el token y escribir OTP
    const sbAdmin = createClient(url, service, { auth: { autoRefreshToken: false } });
    const { data: userData, error: userErr } = await sbAdmin.auth.getUser(token);
    if (userErr || !userData?.user?.email) {
      // Fallback: intentar con anon key + token como cliente autenticado
      if (anonKey) {
        const sbAnon = createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { autoRefreshToken: false },
        });
        const { data: anonUser, error: anonErr } = await sbAnon.auth.getUser();
        if (!anonErr && anonUser?.user?.email) {
          return await handleSend(sbAdmin, anonUser.user.email);
        }
      }
      return json({ error: "Sesión inválida o expirada" }, 401);
    }

    return await handleSend(sbAdmin, userData.user.email);
  }),
);

async function handleSend(sb: any, email: string) {
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit simple: máximo 5 OTP no expirados en últimos 10 min
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await sb
    .from("otp_transferencias")
    .select("id", { count: "exact", head: true })
    .eq("correo", normalizedEmail)
    .eq("usado", false)
    .gte("expires_at", new Date().toISOString())
    .gte("created_at", since);

  if ((count ?? 0) >= 5) {
    return json({ error: "Demasiados códigos enviados. Intenta en unos minutos." }, 429);
  }

  // Invalidar OTPs previos no usados del mismo correo para que solo el último sea válido
  await sb
    .from("otp_transferencias")
    .update({ usado: true })
    .eq("correo", normalizedEmail)
    .eq("usado", false);

  // Generador criptográfico: Math.random no es apto para códigos de seguridad.
  const codigo = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: insErr } = await sb.from("otp_transferencias").insert({
    correo: normalizedEmail,
    codigo,
    expires_at: expiresAt,
    usado: false,
  });
  if (insErr) return json({ error: insErr.message }, 500);

  let sent = true;
  try {
    sent = await sendEmail(otpEmail(normalizedEmail, codigo));
  } catch (e: any) {
    // No revertir el insert para permitir reintento de verificación si el mail falló por rate limit de Resend;
    // pero informar error
    return json({ error: e?.message ?? "No se pudo enviar el correo" }, 500);
  }

  return json({ ok: true, expires_at: expiresAt, ...(sent ? {} : { demo_codigo: codigo }) });
}
