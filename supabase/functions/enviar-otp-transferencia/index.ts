// Edge Function: envía OTP de 6 dígitos para confirmar transferencia.
// Reutiliza credenciales RESEND_API_KEY y RESEND_FROM ya configuradas.
// Requiere usuario autenticado (Authorization: Bearer <jwt>).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { brand } from "../_shared/brand.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

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
});

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

  const codigo = String(Math.floor(100000 + Math.random() * 900000));
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
    sent = await sendOtpEmail(normalizedEmail, codigo);
  } catch (e: any) {
    // No revertir el insert para permitir reintento de verificación si el mail falló por rate limit de Resend;
    // pero informar error
    return json({ error: e?.message ?? "No se pudo enviar el correo" }, 500);
  }

  return json({ ok: true, expires_at: expiresAt, ...(sent ? {} : { demo_codigo: codigo }) });
}

// Devuelve false si no hay RESEND_API_KEY (modo demo): el código se muestra en pantalla.
async function sendOtpEmail(email: string, codigo: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from =
    Deno.env.get("RESEND_FROM") || `${brand.email.fromName} <${brand.email.fromAddress}>`;
  if (!apiKey) return false;
  const primary = brand.colors.primary["500"];
  const cardBg = "#ffffff";

  const html = `
  <!doctype html>
  <html lang="es">
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:'Inter',Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:${cardBg};border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:#0a0a0a;padding:22px 32px;">
                  <span style="color:${primary};font-weight:700;font-size:20px;letter-spacing:-0.02em;">${brand.name}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:32px 32px 8px;">
                  <h1 style="margin:0;font-size:20px;color:#111827;font-weight:700;">Tu código de verificación</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 32px 16px;">
                  <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
                    Usá el siguiente código para confirmar tu transferencia. Vence en <strong>10 minutos</strong>. No lo compartas con nadie.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center" style="padding:16px 0 20px;">
                        <span style="display:inline-block;letter-spacing:8px;font-size:32px;font-weight:800;color:#111827;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 20px;">${codigo}</span>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
                    Si no solicitaste este código, ignorá este correo. Tu transferencia no se ejecutará sin el código.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f0f0f0;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">© ${brand.name}. Todos los derechos reservados.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Tu código ${brand.name} es ${codigo}`,
      html,
      text: `Tu código de verificación ${brand.name} es ${codigo}. Vence en 10 minutos. No lo compartas.`,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("No se pudo enviar el correo: " + t);
  }
  return true;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
