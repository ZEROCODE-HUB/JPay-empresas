// Edge Function: correo de «olvidé mi contraseña» por Resend, con la plantilla de la marca.
// Body: { email, origen? } (`origen` = window.location.origin del portal).
//
// - Con el correo configurado (clave de Resend): genera el enlace de recuperación con
//   `auth.admin.generateLink` y lo manda. El enlace abre `/reset-password?token_hash=…&type=recovery`
//   en el portal, que valida el token y deja elegir la contraseña nueva. Responde `enviado: true`.
// - Sin correo configurado (modo demo): responde `enviado: false` y el portal cae al correo propio
//   de Supabase Auth (`resetPasswordForEmail`).
//
// Nunca revela si el correo tiene cuenta: la respuesta es la misma exista o no. Tope de un correo
// por minuto por destinatario (`correo_reservar_envio`), para que no sirva para llenar bandejas.
// La llama cualquiera (con la clave pública): es el formulario de la pantalla de acceso.

import { configCorreo, recuperacionEmail, sendEmail } from "../_shared/email.ts";
import { handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(
  handler(async (req) => {
    const b = await readJson<{ email?: unknown; origen?: unknown }>(req);
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!CORREO.test(email) || email.length > 160) {
      throw new HttpError(400, "Escribe un correo válido");
    }

    const cfg = await configCorreo();
    if (!cfg.apiKey) return json({ ok: true, enviado: false });

    const sb = serviceClient();
    const { data: libre } = await sb.rpc("correo_reservar_envio", {
      p_clave: `recuperar:${await sha256(email)}`,
      p_intervalo: "60 seconds",
    });
    if (libre === true) {
      try {
        const { data, error } = await sb.auth.admin.generateLink({ type: "recovery", email });
        const hash = data?.properties?.hashed_token;
        // Sin cuenta con ese correo no hay enlace: no se envía nada (y no se avisa).
        if (!error && hash) {
          const pagina = new URL("/reset-password", origenDelPortal(b.origen));
          pagina.searchParams.set("token_hash", hash);
          pagina.searchParams.set("type", "recovery");
          await sendEmail(recuperacionEmail(email, pagina.toString()));
        }
      } catch (e) {
        console.error("recuperar-contrasena: no se pudo enviar:", (e as Error).message);
      }
    }
    return json({ ok: true, enviado: true });
  }),
);

/** Origen del portal: el de `APP_URL`, o localhost en desarrollo. Nunca otro dominio. */
function origenDelPortal(pedido: unknown): string {
  const app = Deno.env.get("APP_URL")?.trim();
  if (typeof pedido === "string") {
    try {
      const u = new URL(pedido);
      const local = ["localhost", "127.0.0.1"].includes(u.hostname) && u.protocol === "http:";
      if (local || (app && u.origin === new URL(app).origin)) return u.origin;
    } catch {
      // origen inválido: se usa el de la app
    }
  }
  if (!app) throw new HttpError(500, "Falta APP_URL en la configuración del servidor");
  return new URL(app).origin;
}

async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, "0")).join("");
}
