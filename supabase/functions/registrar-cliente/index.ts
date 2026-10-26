// Edge Function: registro inicial del portal empresas.
// 1) Crea el usuario en Supabase Auth SIN confirmar (admin_via_edge=true para que
//    el trigger on_auth_admin_user_created NO cree fila en admin_users).
// 2) Genera un token de verificación de correo y lo persiste.
// 3) Envía el email de verificación por Resend con el link /verificar-correo.
// Rollback: si falla el envío, borra el usuario para poder reintentar.

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

  const { email, password, nombre, apellido, fechaNac, tipoCuenta } = body ?? {};
  if (!email || !password || !nombre || !apellido || !tipoCuenta) {
    return json({ error: "Faltan datos del registro" }, 400);
  }

  const sb = createClient(url, service, { auth: { autoRefreshToken: false } });

  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { admin_via_edge: true, nombre, apellido, tipoCuenta },
  });
  if (authErr || !authData.user) {
    const raw = (authErr?.message ?? "").toLowerCase();
    const isDup = (raw.includes("already") && raw.includes("registered")) ||
      raw.includes("already exists") || raw.includes("duplicate") || raw.includes("already been");
    if (isDup) {
      return json({ error: "Ya existe una cuenta con ese correo. Si ya te registraste, iniciá sesión. Si no verificaste tu correo, revisá tu bandeja/spam o usá '¿No te llegó el email de verificación?' en el login para reenviarlo. Si olvidaste la contraseña, usá '¿Olvidaste tu contraseña?'." }, 400);
    }
    return json({ error: authErr?.message ?? "No se pudo crear el usuario" }, 400);
  }
  const authId = authData.user.id;

  try {
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const { error: tErr } = await sb.from("verificaciones_correo").insert({
      token,
      user_id: authId,
      correo: email,
      expires_at: expires,
    });
    if (tErr) throw tErr;

    // Crear fila en clientes con estado inicial pendiente_verificacion para que aparezca en el panel admin.
    // CUIT placeholder único con prefijo 99 (no colisiona con CUITs reales 20/27/30/33).
    // Si ya existe fila con ese correo (ej: borrado lógico previo con estado deshabilitado/eliminado o intento fallido), reusarla.
    const tipoPersona = tipoCuenta === "juridica" ? "juridica" : "fisica";
    const nombreCompleto = `${nombre} ${apellido}`.trim();
    let clienteLegajo: string | null = null;
    const { data: existente } = await sb.from("clientes").select("legajo").eq("correo", email).maybeSingle();
    if (existente) {
      let lastUpdErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const placeholderCuit = generatePlaceholderCuit(authId, email, attempt);
        const { data: updRow, error: updErr } = await sb.from("clientes").update({
          tipo_persona: tipoPersona,
          nombre: nombreCompleto,
          cuit: placeholderCuit,
          estado: "pendiente_verificacion",
          estado_onboarding: "pendiente",
          email_verificado: false,
          onboarding_completo: false,
        }).eq("correo", email).select("legajo").single();
        if (!updErr && updRow) { clienteLegajo = updRow.legajo; lastUpdErr = null; break; }
        lastUpdErr = updErr;
        const msg = updErr?.message ?? "";
        const isDup = msg.includes("clientes_cuit_key") || msg.includes("clientes_legajo_key") || msg.includes("duplicate");
        if (!isDup) break;
      }
      if (lastUpdErr) throw lastUpdErr;
    } else {
      let lastInsertErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const placeholderCuit = generatePlaceholderCuit(authId, email, attempt);
        const { data: cliRow, error: cliInsErr } = await sb.from("clientes").insert({
          tipo_persona: tipoPersona,
          correo: email,
          nombre: nombreCompleto,
          cuit: placeholderCuit,
          estado: "pendiente_verificacion",
          estado_onboarding: "pendiente",
          email_verificado: false,
          onboarding_completo: false,
        }).select("legajo").single();
        if (!cliInsErr && cliRow) { clienteLegajo = cliRow.legajo; lastInsertErr = null; break; }
        lastInsertErr = cliInsErr;
        const msg = cliInsErr?.message ?? "";
        const isDupCuit = msg.includes("clientes_cuit_key") || msg.includes("clientes_legajo_key") || msg.includes("duplicate");
        const isDupCorreo = msg.includes("clientes_correo_key");
        if (isDupCorreo) {
          // Carrera: otro proceso insertó entre el select y el insert; reintentar como update
          const { data: retryUpd, error: retryErr } = await sb.from("clientes").update({
            tipo_persona: tipoPersona,
            nombre: nombreCompleto,
            cuit: placeholderCuit,
            estado: "pendiente_verificacion",
            estado_onboarding: "pendiente",
            email_verificado: false,
            onboarding_completo: false,
          }).eq("correo", email).select("legajo").single();
          if (!retryErr && retryUpd) { clienteLegajo = retryUpd.legajo; lastInsertErr = null; break; }
          lastInsertErr = retryErr;
          break;
        }
        if (!isDupCuit) break;
      }
      if (lastInsertErr) throw lastInsertErr;
    }

    const sent = await sendVerificationEmail(email, nombreCompleto, token);
    return json({ ok: true, email, legajo: clienteLegajo, ...(sent ? {} : { demo_token: token }) });
  } catch (e: any) {
    // Rollback coordinado: borrar cliente placeholder, token y usuario para permitir reintento limpio
    try { await sb.from("clientes").delete().eq("correo", email); } catch { /* ignore */ }
    try { await sb.from("verificaciones_correo").delete().eq("user_id", authId); } catch { /* ignore */ }
    await sb.auth.admin.deleteUser(authId);
    return json({ error: e?.message ?? "No se pudo enviar el correo de verificación" }, 400);
  }
});

// Devuelve false si no hay RESEND_API_KEY (modo demo): el correo no se envía y el portal
// muestra el link de verificación en pantalla.
async function sendVerificationEmail(email: string, nombre: string, token: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";
  const from = Deno.env.get("RESEND_FROM") || `${brand.email.fromName} <${brand.email.fromAddress}>`;
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

function generatePlaceholderCuit(authId: string, email: string, attempt: number): string {
  // Prefijo 99 no usado en CUITs reales; 9 dígitos restantes pseudo-aleatorios derivados de authId+email+attempt
  const seed = `${authId}:${email}:${attempt}:${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const abs = Math.abs(hash);
  // Mezclar con random para evitar colisión entre reintentos rápidos
  const rand = Math.floor(Math.random() * 1_000_000_000);
  const combined = (abs ^ rand) % 1_000_000_000;
  const nine = String(combined).padStart(9, "0");
  return `99${nine}`;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
