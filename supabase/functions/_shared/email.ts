// Envío de emails por Resend y plantillas con la marca.
//
// Modo demo: sin RESEND_API_KEY no se envía nada y `sendEmail` devuelve false; cada función
// devuelve entonces el token/código en la respuesta para que el portal lo muestre en pantalla.
import { brand } from "./brand.ts";

export type Email = { to: string; subject: string; html: string; text: string };

/** Envía por Resend. false = modo demo (sin RESEND_API_KEY); lanza Error si Resend lo rechaza. */
export async function sendEmail(email: Email): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;
  const from =
    Deno.env.get("RESEND_FROM") || `${brand.email.fromName} <${brand.email.fromAddress}>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) throw new Error("No se pudo enviar el correo: " + (await res.text()));
  return true;
}

export function appUrl(): string {
  return Deno.env.get("APP_URL") || "http://localhost:5173";
}

const primary = brand.colors.primary["500"];
// Links de texto: tono oscuro de la escala para cumplir contraste sobre blanco.
const linkColor = brand.colors.primary["700"];

/** Estructura común: encabezado con la marca, contenido y pie. */
function layout(contenido: string): string {
  return `
  <!doctype html>
  <html lang="es">
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:'Inter',Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:#0a0a0a;padding:22px 32px;">
                  <span style="color:${primary};font-weight:700;font-size:20px;letter-spacing:-0.02em;">${brand.name}</span>
                </td>
              </tr>
${contenido}
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
}

/** Email con el link para validar el correo al registrarse. */
export function verificationEmail(to: string, nombre: string, token: string): Email {
  const url = appUrl();
  const link = `${url}/verificar-correo?token=${token}`;
  const html = layout(`
              <tr>
                <td style="padding:32px 32px 4px;">
                  <h1 style="margin:0;font-size:22px;color:#111827;font-weight:700;">Hola ${nombre},</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 32px 24px;">
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
                    Muchas gracias por registrarte en <a href="${url}" style="color:${linkColor};font-weight:600;text-decoration:none;">${brand.name}</a>.
                  </p>
                  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                    Para poder ingresar a la plataforma primero debes validar tu correo electrónico. Para realizarlo haz click en el botón debajo.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="border-radius:8px;background:${primary};">
                        <a href="${link}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${brand.colors.onPrimary};text-decoration:none;">Validar mi correo</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">
                    Si tienes una duda o inconveniente puedes contactarnos en <a href="mailto:${brand.contact.support}" style="color:${linkColor};text-decoration:none;">${brand.contact.support}</a>
                  </p>
                  <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">¡Muchas gracias!</p>
                </td>
              </tr>`);
  return {
    to,
    subject: `Verifica tu correo electrónico · ${brand.name}`,
    html,
    text: `Hola ${nombre}, muchas gracias por registrarte en ${brand.name}. Valida tu correo para ingresar a la plataforma: ${link}`,
  };
}

/** Email con el código OTP para confirmar una transferencia. */
export function otpEmail(to: string, codigo: string): Email {
  const html = layout(`
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
              </tr>`);
  return {
    to,
    subject: `Tu código ${brand.name} es ${codigo}`,
    html,
    text: `Tu código de verificación ${brand.name} es ${codigo}. Vence en 10 minutos. No lo compartas.`,
  };
}
