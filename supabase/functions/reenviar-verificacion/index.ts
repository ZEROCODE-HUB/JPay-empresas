// Edge Function: reenvía el email de verificación de correo.
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
  if (!url || !service) return json({ error: "Falta configuración del servidor" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const email = body?.email;
  if (!email) return json({ error: "Falta el correo" }, 400);

  const sb = createClient(url, service, { auth: { autoRefreshToken: false } });

  const { data: userRes, error: uErr } = await sb.auth.admin.getUserByEmail(email);
  if (uErr || !userRes.user) {
    return json({ error: "No existe una cuenta con ese correo" }, 400);
  }
  const user = userRes.user;
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
  if (tErr) return json({ error: tErr.message }, 400);

  try {
    const sent = await sendVerificationEmail(email, nombre, token);
    return json({ ok: true, email, ...(sent ? {} : { demo_token: token }) });
  } catch (e: any) {
    return json({ error: e?.message ?? "No se pudo enviar el correo" }, 400);
  }
});

// Devuelve false si no hay RESEND_API_KEY (modo demo): el correo no se envía y el portal
// muestra el link de verificación en pantalla.
async function sendVerificationEmail(
  email: string,
  nombre: string,
  token: string,
): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";
  const from =
    Deno.env.get("RESEND_FROM") || `${brand.email.fromName} <${brand.email.fromAddress}>`;
  if (!apiKey) return false;

  const link = `${appUrl}/verificar-correo?token=${token}`;
  const primary = brand.colors.primary["500"];
  const onPrimary = brand.colors.onPrimary;
  // Links de texto: tono oscuro de la escala para cumplir contraste sobre blanco.
  const linkColor = brand.colors.primary["700"];
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
                <td style="padding:32px 32px 4px;">
                  <h1 style="margin:0;font-size:22px;color:#111827;font-weight:700;">Hola ${nombre},</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 32px 24px;">
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
                    Muchas gracias por registrarte en <a href="${appUrl}" style="color:${linkColor};font-weight:600;text-decoration:none;">${brand.name}</a>.
                  </p>
                  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                    Para poder ingresar a la plataforma primero debes validar tu correo electrónico. Para realizarlo haz click en el botón debajo.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="border-radius:8px;background:${primary};">
                        <a href="${link}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${onPrimary};text-decoration:none;">Validar mi correo</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">
                    Si tienes una duda o inconveniente puedes contactarnos en <a href="mailto:${brand.contact.support}" style="color:${linkColor};text-decoration:none;">${brand.contact.support}</a>
                  </p>
                  <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">¡Muchas gracias!</p>
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
      subject: `Verifica tu correo electrónico · ${brand.name}`,
      html,
      text: `Hola ${nombre}, muchas gracias por registrarte en ${brand.name}. Valida tu correo para ingresar a la plataforma: ${link}`,
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
