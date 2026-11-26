// Envío de correos por Resend y plantillas con la marca.
//
// De dónde sale la configuración (en este orden):
//   1. Secretos de entorno de las Edge Functions: RESEND_API_KEY, RESEND_FROM, SOPORTE_EMAIL.
//   2. La tabla `correo_config`, que se llena desde el admin (Sistema › Integraciones › Correo):
//      la clave de Resend vive en Vault y nunca vuelve al navegador.
// Con cualquiera de las dos basta: para activar el correo solo hay que cargar la clave de Resend.
//
// Modo demo: sin clave no se envía nada y `sendEmail` devuelve false; las funciones de registro
// y de código de transferencia devuelven entonces el token/código en la respuesta para que el
// portal lo muestre en pantalla.
import { brand } from "./brand.ts";
import { serviceClient } from "./http.ts";

export type Email = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** A quién responde el destinatario al tocar «Responder». */
  replyTo?: string;
};

export type ConfigCorreo = {
  /** Clave de Resend (null = modo demo). */
  apiKey: string | null;
  origenClave: "entorno" | "panel" | null;
  /** Últimos 4 caracteres de la clave, para mostrarla en el admin. */
  pista: string | null;
  from: string;
  /** El remitente no está configurado y se usa el de pruebas de Resend. */
  fromDePrueba: boolean;
  /** Buzón que recibe las solicitudes de los clientes (null = sin configurar). */
  soporte: string | null;
  /** Dirección del panel admin, para los enlaces de los avisos. */
  adminUrl: string | null;
  probado: { at: string; ok: boolean; detalle: string | null } | null;
  actualizado: { at: string; por: string | null } | null;
};

/** Dominios reservados de ejemplo (los de la marca mientras no se carguen los reales). */
const esDeEjemplo = (correo: string) =>
  /@[^>\s]*\.(example|test|invalid|localhost)\b/i.test(correo);

/** Remitente de pruebas de Resend: sirve sin verificar dominio, pero solo le escribe al dueño de la cuenta. */
const FROM_DE_PRUEBA = `${brand.email.fromName} <onboarding@resend.dev>`;

let cache: { valor: ConfigCorreo; vence: number } | null = null;
const CACHE_MS = 60_000;

/** Olvida la configuración en memoria (después de cambiarla desde el admin). */
export function olvidarConfigCorreo(): void {
  cache = null;
}

/** Configuración vigente del correo: entorno primero y, lo que falte, de `correo_config`. */
export async function configCorreo(): Promise<ConfigCorreo> {
  if (cache && cache.vence > Date.now()) return cache.valor;

  type Fila = {
    remitente?: string | null;
    destino?: string | null;
    pista?: string | null;
    clave?: string | null;
    admin_url?: string | null;
    probado_at?: string | null;
    probado_ok?: boolean | null;
    probado_detalle?: string | null;
    updated_at?: string | null;
    updated_by?: string | null;
  };
  let fila: Fila = {};
  try {
    const { data } = await serviceClient().rpc("correo_leer_config");
    if (data && typeof data === "object") fila = data as Fila;
  } catch {
    // Sin base (o sin la migración): se trabaja solo con los secretos de entorno.
  }

  const env = (n: string) => Deno.env.get(n)?.trim() || null;
  const claveEnv = env("RESEND_API_KEY");
  const clavePanel = fila.clave?.trim() || null;
  const apiKey = claveEnv ?? clavePanel;

  const pedido = env("RESEND_FROM") ?? fila.remitente?.trim() ?? null;
  const deMarca = `${brand.email.fromName} <${brand.email.fromAddress}>`;
  const fromDePrueba = !pedido && esDeEjemplo(brand.email.fromAddress);
  const from = pedido ?? (fromDePrueba ? FROM_DE_PRUEBA : deMarca);

  const soportePedido = env("SOPORTE_EMAIL") ?? fila.destino?.trim() ?? brand.contact.support;
  const soporte = soportePedido && !esDeEjemplo(soportePedido) ? soportePedido : null;

  const valor: ConfigCorreo = {
    apiKey,
    origenClave: claveEnv ? "entorno" : clavePanel ? "panel" : null,
    pista: apiKey ? apiKey.slice(-4) : null,
    from,
    fromDePrueba,
    soporte,
    adminUrl: env("ADMIN_URL") ?? fila.admin_url?.trim() ?? null,
    probado: fila.probado_at
      ? { at: fila.probado_at, ok: fila.probado_ok === true, detalle: fila.probado_detalle ?? null }
      : null,
    actualizado: fila.updated_at ? { at: fila.updated_at, por: fila.updated_by ?? null } : null,
  };
  cache = { valor, vence: Date.now() + CACHE_MS };
  return valor;
}

/** Lo que respondió Resend, en una frase que entienda quien configura el correo. */
function motivoResend(status: number, cuerpo: string): string {
  let mensaje = cuerpo;
  try {
    const j = JSON.parse(cuerpo) as { message?: string; error?: string };
    mensaje = j.message ?? j.error ?? cuerpo;
  } catch {
    // no era JSON
  }
  if (status === 401) return "la clave de Resend no es válida o fue revocada";
  if (status === 403 && /domain|verify|testing emails/i.test(mensaje)) {
    return `el dominio del remitente no está verificado en Resend (${mensaje})`;
  }
  return `${mensaje || "sin detalle"} (HTTP ${status})`;
}

/** Envía por Resend. false = modo demo (sin clave); lanza Error si Resend lo rechaza. */
export async function sendEmail(email: Email): Promise<boolean> {
  const cfg = await configCorreo();
  if (!cfg.apiKey) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.from,
      to: Array.isArray(email.to) ? email.to : [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error("No se pudo enviar el correo: " + motivoResend(res.status, await res.text()));
  }
  return true;
}

export function appUrl(): string {
  return Deno.env.get("APP_URL") || "http://localhost:5173";
}

/** Texto del usuario dentro de HTML. */
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

/** Botón principal de un correo. */
function boton(url: string, texto: string): string {
  return `
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="border-radius:8px;background:${primary};">
                        <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${brand.colors.onPrimary};text-decoration:none;">${esc(texto)}</a>
                      </td>
                    </tr>
                  </table>`;
}

/** Correo con el link para validar el correo al registrarse. */
export function verificationEmail(to: string, nombre: string, token: string): Email {
  const url = appUrl();
  const link = `${url}/verificar-correo?token=${token}`;
  const html = layout(`
              <tr>
                <td style="padding:32px 32px 4px;">
                  <h1 style="margin:0;font-size:22px;color:#111827;font-weight:700;">Hola ${esc(nombre)},</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 32px 24px;">
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
                    Muchas gracias por registrarte en <a href="${url}" style="color:${linkColor};font-weight:600;text-decoration:none;">${brand.name}</a>.
                  </p>
                  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                    Para ingresar a la plataforma primero debes validar tu correo electrónico. Haz clic en el botón de abajo.
                  </p>${boton(link, "Validar mi correo")}
                  <p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">
                    Si tienes una duda o inconveniente puedes escribirnos a <a href="mailto:${brand.contact.support}" style="color:${linkColor};text-decoration:none;">${brand.contact.support}</a>
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

/** Correo con el código de un solo uso para confirmar una transferencia. */
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
                    Usa el siguiente código para confirmar tu transferencia. Vence en <strong>10 minutos</strong>. No lo compartas con nadie.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center" style="padding:16px 0 20px;">
                        <span style="display:inline-block;letter-spacing:8px;font-size:32px;font-weight:800;color:#111827;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 20px;">${esc(codigo)}</span>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
                    Si no solicitaste este código, ignora este correo. Tu transferencia no se ejecutará sin el código.
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

export type DatosSolicitud = {
  /** Nombre del servicio pedido, como lo ve el equipo («Cobros con tarjeta»…). */
  servicio: string;
  cliente: string;
  legajo: string;
  comercio?: string | null;
  nombre: string;
  telefono: string;
  correo: string;
  mensaje?: string | null;
  /** true si corrigió una solicitud que ya estaba abierta. */
  actualizada?: boolean;
};

/** Aviso al buzón de soporte: un cliente pidió la activación de un servicio (o ayuda). */
export function solicitudContactoEmail(
  to: string,
  d: DatosSolicitud,
  adminUrl: string | null,
): Email {
  const fila = (etiqueta: string, valor: string) => `
                    <tr>
                      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${etiqueta}</td>
                      <td style="padding:6px 0;font-size:14px;color:#111827;">${valor}</td>
                    </tr>`;
  const panel = adminUrl ? `${adminUrl.replace(/\/+$/, "")}/admin/general/solicitudes` : null;
  const telefono = d.telefono.replace(/[^\d+]/g, "");
  const html = layout(`
              <tr>
                <td style="padding:32px 32px 4px;">
                  <h1 style="margin:0;font-size:20px;color:#111827;font-weight:700;">${d.actualizada ? "Solicitud actualizada" : "Nueva solicitud"}: ${esc(d.servicio)}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 32px 28px;">
                  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
                    Un cliente pidió desde el portal que lo contacten. Estos son sus datos:
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                    ${fila("Cliente", `${esc(d.cliente)} <span style="color:#6b7280;">(${esc(d.legajo)})</span>`)}
                    ${d.comercio ? fila("Comercio", esc(d.comercio)) : ""}
                    ${fila("Contacto", esc(d.nombre))}
                    ${fila("Teléfono", `<a href="tel:${esc(telefono)}" style="color:${linkColor};text-decoration:none;">${esc(d.telefono)}</a>`)}
                    ${fila("Correo", `<a href="mailto:${esc(d.correo)}" style="color:${linkColor};text-decoration:none;">${esc(d.correo)}</a>`)}
                    ${d.mensaje ? fila("Mensaje", esc(d.mensaje).replace(/\n/g, "<br>")) : ""}
                  </table>
                  ${panel ? boton(panel, "Ver en el panel") : `<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">Atiéndela en el panel: Clientes › Solicitudes de contacto.</p>`}
                </td>
              </tr>`);
  const lineas = [
    `${d.actualizada ? "Solicitud actualizada" : "Nueva solicitud"}: ${d.servicio}`,
    `Cliente: ${d.cliente} (${d.legajo})`,
    d.comercio ? `Comercio: ${d.comercio}` : null,
    `Contacto: ${d.nombre}`,
    `Teléfono: ${d.telefono}`,
    `Correo: ${d.correo}`,
    d.mensaje ? `Mensaje: ${d.mensaje}` : null,
    panel ? `Panel: ${panel}` : "Atiéndela en el panel: Clientes › Solicitudes de contacto.",
  ].filter(Boolean);
  return {
    to,
    subject: `${d.servicio}: ${d.cliente} pide contacto · ${brand.name}`,
    html,
    text: lineas.join("\n"),
    replyTo: d.correo,
  };
}

/** Correo de prueba que manda el admin para comprobar la configuración. */
export function pruebaEmail(to: string): Email {
  const html = layout(`
              <tr>
                <td style="padding:32px 32px 28px;">
                  <h1 style="margin:0 0 12px;font-size:20px;color:#111827;font-weight:700;">El correo de ${brand.name} funciona</h1>
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
                    Este es un correo de prueba enviado desde el panel de administración. Si lo estás leyendo, la conexión con el servicio de correo quedó bien configurada.
                  </p>
                </td>
              </tr>`);
  return {
    to,
    subject: `Correo de prueba · ${brand.name}`,
    html,
    text: `Este es un correo de prueba de ${brand.name}. Si lo estás leyendo, el correo quedó bien configurado.`,
  };
}

/** Correo con el enlace para elegir una contraseña nueva. */
/**
 * Alguien intentó registrarse (o pidió reenviar la verificación) con un correo que ya tiene cuenta
 * verificada. La pantalla responde igual que siempre para no revelar qué correos están
 * registrados; el aviso le llega solo al dueño del correo.
 */
export function cuentaExistenteEmail(to: string): Email {
  const url = appUrl();
  const html = layout(`
              <tr>
                <td style="padding:32px 32px 4px;">
                  <h1 style="margin:0;font-size:20px;color:#111827;font-weight:700;">Ya tienes una cuenta</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 32px 28px;">
                  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                    Alguien (probablemente tú) intentó crear una cuenta de ${brand.name} con este correo, pero ya está registrado. Inicia sesión; si no recuerdas tu contraseña, usa «¿Olvidaste tu contraseña?».
                  </p>${boton(`${url}/login`, "Iniciar sesión")}
                  <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                    Si no fuiste tú, ignora este correo: tu cuenta sigue igual.
                  </p>
                </td>
              </tr>`);
  return {
    to,
    subject: `Ya tienes una cuenta en ${brand.name}`,
    html,
    text: `Este correo ya tiene una cuenta en ${brand.name}. Inicia sesión en ${url}/login. Si no fuiste tú, ignora este correo.`,
  };
}

/** Manda `cuentaExistenteEmail` como mucho una vez cada 10 minutos por correo (best-effort). */
// deno-lint-ignore no-explicit-any
export async function avisarCuentaExistente(sb: any, to: string): Promise<void> {
  try {
    const { data: libre } = await sb.rpc("correo_reservar_envio", {
      p_clave: `cuenta-existente:${to.trim().toLowerCase()}`,
      p_intervalo: "10 minutes",
    });
    if (libre) await sendEmail(cuentaExistenteEmail(to));
  } catch {
    // No cambia la respuesta: es solo un aviso.
  }
}

export function recuperacionEmail(to: string, link: string): Email {
  const html = layout(`
              <tr>
                <td style="padding:32px 32px 4px;">
                  <h1 style="margin:0;font-size:20px;color:#111827;font-weight:700;">Restablece tu contraseña</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 32px 28px;">
                  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                    Recibimos una solicitud para cambiar la contraseña de tu cuenta de ${brand.name}. Haz clic en el botón para elegir una nueva.
                  </p>${boton(link, "Elegir contraseña nueva")}
                  <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                    Por seguridad, el enlace vence en poco tiempo y solo sirve una vez. Si no pediste este cambio, ignora este correo: tu contraseña sigue igual.
                  </p>
                </td>
              </tr>`);
  return {
    to,
    subject: `Restablece tu contraseña · ${brand.name}`,
    html,
    text: `Para elegir una contraseña nueva en ${brand.name}, abre este enlace: ${link}\nSi no pediste este cambio, ignora este correo.`,
  };
}
