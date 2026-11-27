// Plantillas de los avisos por correo al cliente (tabla `avisos_correo`, migración 1078).
// Nunca se nombra al proveedor (banco o pasarela): el cliente solo ve la marca.
import { brand } from "./brand.ts";
import { appUrl, boton, type Email, esc, layout } from "./email.ts";

export type EventoAviso =
  | "deposito_recibido"
  | "cobro_recibido"
  | "cobro_spei_recibido"
  | "envio_completado"
  | "envio_fallido"
  | "lote_completado"
  | "lote_fallido"
  | "contracargo_recibido"
  | "cuenta_aprobada";

type Datos = Record<string, unknown>;
const t = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export function formatoMonto(monto: unknown, moneda: unknown = "MXN"): string {
  const n = Number(monto ?? 0);
  const m = t(moneda) ?? "MXN";
  const cifra = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
  return m === "USD" ? `US$${cifra} USD` : `$${cifra} ${m}`;
}

function fecha(v: unknown): string | null {
  const s = t(v);
  if (!s) return null;
  // Postgres da «2026-11-27 03:20:25.7+00»: se lleva a ISO (T y zona con minutos).
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? `${s}T12:00:00-06:00`
    : s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(d);
}

const METODOS: Record<string, string> = {
  card: "Tarjeta",
  tarjeta: "Tarjeta",
  oxxo: "Efectivo en OXXO",
  spei: "Transferencia SPEI",
  paycash: "Efectivo",
};

const ESTADO_FALLIDO: Record<string, string> = {
  rechazada: "fue rechazada",
  fallida: "no se pudo completar",
  devuelta: "fue devuelta por el banco destino",
};

function ocultarCuenta(n: unknown): string | null {
  const s = t(n);
  return s ? (s.length > 4 ? `•••• ${s.slice(-4)}` : s) : null;
}

type Contenido = {
  asunto: string;
  titulo: string;
  intro: string;
  filas: [string, string | null][];
  /** Ruta del portal para el botón. */
  ruta: string;
  boton: string;
  nota?: string;
};

function contenido(evento: EventoAviso, d: Datos): Contenido {
  const monto = formatoMonto(d.monto, d.moneda);
  switch (evento) {
    case "deposito_recibido":
      return {
        asunto: `Recibiste un depósito de ${monto}`,
        titulo: "Recibiste un depósito",
        intro: `Te llegó una transferencia SPEI por <strong>${esc(monto)}</strong>. Ya está disponible en tu saldo.`,
        filas: [
          ["Monto", monto],
          ["De", t(d.remitente)],
          ["Cuenta de origen", ocultarCuenta(d.remitente_cuenta)],
          ["Clave de rastreo", t(d.clave_rastreo)],
          ["Fecha", fecha(d.fecha)],
        ],
        ruta: "/app/cobrar/spei",
        boton: "Ver mis depósitos",
      };
    case "cobro_recibido":
    case "cobro_spei_recibido":
      return {
        asunto: `Recibiste un pago de ${monto}`,
        titulo: "Recibiste un pago",
        intro: `${t(d.pagador) ? esc(d.pagador) : "Un cliente"} te pagó <strong>${esc(monto)}</strong>.`,
        filas: [
          ["Monto", monto],
          [
            "Medio de pago",
            evento === "cobro_spei_recibido"
              ? "Transferencia SPEI"
              : (METODOS[t(d.metodo) ?? ""] ?? t(d.metodo)),
          ],
          ["Pagador", t(d.pagador)],
          ["Correo del pagador", t(d.pagador_email)],
          ["Concepto", t(d.concepto)],
          ["Referencia", t(d.referencia)],
          ["Fecha", fecha(d.fecha)],
        ],
        ruta: evento === "cobro_spei_recibido" ? "/app/cobrar/spei" : "/app/historial",
        boton: "Ver mis cobros",
      };
    case "envio_completado": {
      const usd = t(d.moneda) === "USD";
      return {
        asunto: `Tu transferencia de ${monto} se completó`,
        titulo: "Transferencia completada",
        intro: `Tu transferencia por <strong>${esc(monto)}</strong> a ${esc(d.titular ?? "tu destinatario")} llegó a su destino.`,
        filas: [
          ["Monto", monto],
          ["Destinatario", t(d.titular)],
          ["Cuenta", ocultarCuenta(d.numero)],
          ["Concepto", t(d.concepto)],
          [usd ? "UETR" : "Clave de rastreo", usd ? t(d.uetr) : t(d.clave_rastreo)],
        ],
        ruta: usd ? "/app/enviar/dolares" : "/app/enviar/spei",
        boton: "Ver el comprobante",
        nota:
          !usd && t(d.cep)
            ? `También puedes consultar el comprobante oficial de Banxico (CEP): <a href="${esc(d.cep)}" style="color:#374151;">ver CEP</a>.`
            : undefined,
      };
    }
    case "envio_fallido": {
      const usd = t(d.moneda) === "USD";
      const que = ESTADO_FALLIDO[t(d.estado) ?? ""] ?? "no se pudo completar";
      return {
        asunto: `Tu transferencia de ${monto} ${que}`,
        titulo: "Tu transferencia no llegó",
        intro: `Tu transferencia por <strong>${esc(monto)}</strong> a ${esc(d.titular ?? "tu destinatario")} ${que}. El dinero regresó a tu saldo.`,
        filas: [
          ["Monto", monto],
          ["Destinatario", t(d.titular)],
          ["Cuenta", ocultarCuenta(d.numero)],
          ["Motivo", t(d.motivo)],
        ],
        ruta: usd ? "/app/enviar/dolares" : "/app/enviar/spei",
        boton: "Revisar la transferencia",
        nota: "Revisa que los datos del destinatario estén bien y vuelve a intentarlo. Si tienes dudas, escríbenos.",
      };
    }
    case "lote_completado":
    case "lote_fallido": {
      const ok = evento === "lote_completado";
      const total = formatoMonto(d.total, d.moneda);
      const fallidas = Number(d.fallidas ?? 0);
      return {
        asunto: ok
          ? `Tu lote de transferencias terminó`
          : `Tu lote de transferencias no se procesó`,
        titulo: ok ? "Lote de transferencias terminado" : "Lote de transferencias no procesado",
        intro: ok
          ? `Terminamos de procesar tu lote${t(d.archivo) ? ` <strong>${esc(d.archivo)}</strong>` : ""}.${fallidas > 0 ? ` ${fallidas} transferencia(s) no se completaron y su dinero regresó a tu saldo.` : ""}`
          : `Tu lote${t(d.archivo) ? ` <strong>${esc(d.archivo)}</strong>` : ""} no se pudo procesar. El dinero regresó a tu saldo.`,
        filas: [
          ["Transferencias", t(d.cantidad)],
          ["Total", total],
          ["Completadas", ok ? t(d.completadas) : null],
          ["No completadas", ok && fallidas > 0 ? String(fallidas) : null],
          ["Motivo", ok ? null : t(d.motivo)],
        ],
        ruta: "/app/enviar/spei",
        boton: "Ver el lote",
      };
    }
    case "contracargo_recibido":
      return {
        asunto: `Recibiste un contracargo de ${monto}`,
        titulo: "Recibiste un contracargo",
        intro: `El titular de una tarjeta desconoció un cobro por <strong>${esc(monto)}</strong> ante su banco. Responde a tiempo para no perder el monto.`,
        filas: [
          ["Monto", monto],
          ["Motivo", t(d.motivo)],
          ["Fecha límite para responder", fecha(d.vence)],
        ],
        ruta: "/app/cobrar/tarjeta",
        boton: "Ver el contracargo",
        nota: "Ten a la mano la prueba de la venta (ticket, comprobante de entrega o comunicación con tu cliente).",
      };
    case "cuenta_aprobada":
      return {
        asunto: `Tu cuenta ${brand.name} está activa`,
        titulo: "¡Tu cuenta está activa!",
        intro: `Aprobamos tu alta. Ya puedes recibir depósitos en tu CLABE y enviar transferencias desde ${brand.name}.`,
        filas: [],
        ruta: "/app",
        boton: "Entrar a mi cuenta",
      };
  }
}

/** Arma el correo de un aviso para el cliente. */
export function avisoEmail(
  evento: EventoAviso,
  datos: Datos,
  to: string,
  nombre: string | null,
): Email {
  const c = contenido(evento, datos);
  const filas = c.filas.filter((f): f is [string, string] => !!f[1]);
  const link = `${appUrl().replace(/\/+$/, "")}${c.ruta}`;
  const tabla = filas.length
    ? `
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border-top:1px solid #f0f0f0;">
                    ${filas
                      .map(
                        ([k, v]) => `
                    <tr>
                      <td style="padding:8px 12px 8px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;border-bottom:1px solid #f0f0f0;">${esc(k)}</td>
                      <td style="padding:8px 0;font-size:14px;color:#111827;text-align:right;border-bottom:1px solid #f0f0f0;word-break:break-all;">${esc(v)}</td>
                    </tr>`,
                      )
                      .join("")}
                  </table>`
    : "";
  const html = layout(`
              <tr>
                <td style="padding:32px 32px 4px;">
                  <h1 style="margin:0;font-size:20px;color:#111827;font-weight:700;">${esc(c.titulo)}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 32px 28px;">
                  <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">${nombre ? `Hola ${esc(nombre)}, ` : ""}${c.intro}</p>${tabla}${boton(link, c.boton)}
                  ${c.nota ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">${c.nota}</p>` : ""}
                  <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">Te enviamos este aviso porque es un movimiento de tu cuenta ${esc(brand.name)}. Si no lo reconoces, escríbenos a <a href="mailto:${esc(brand.contact.support)}" style="color:#6b7280;">${esc(brand.contact.support)}</a>.</p>
                </td>
              </tr>`);
  const texto = [
    nombre ? `Hola ${nombre},` : null,
    c.intro.replace(/<[^>]+>/g, ""),
    ...filas.map(([k, v]) => `${k}: ${v}`),
    `${c.boton}: ${link}`,
    c.nota
      ? c.nota.replace(/<a href="([^"]+)"[^>]*>[^<]*<\/a>/g, "$1").replace(/<[^>]+>/g, "")
      : null,
  ].filter(Boolean);
  return { to, subject: `${c.asunto} · ${brand.name}`, html, text: texto.join("\n") };
}
