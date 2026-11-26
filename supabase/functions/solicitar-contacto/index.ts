// Edge Function: el cliente pide desde el portal que soporte le active un servicio (cobros con
// tarjeta, cuenta SPEI, domiciliación) o lo ayude. Body:
//   { servicio, nombre, telefono, correo, mensaje?, comercio_id? }
//
// 1) Guarda la solicitud con la RPC `solicitar_contacto` actuando como el usuario: la RPC resuelve
//    su legajo, valida que el comercio sea suyo y no duplica una solicitud que siga abierta.
// 2) Avisa por correo (Resend) al buzón de soporte. Es best-effort: si el correo no está
//    configurado o falla, la solicitud igual queda en el admin (Clientes › Solicitudes de contacto).
//    Para que no se use como cañón de correos, no se avisa más de una vez cada 10 minutos por
//    solicitud.

import { configCorreo, sendEmail, solicitudContactoEmail } from "../_shared/email.ts";
import {
  bearerToken,
  handler,
  HttpError,
  json,
  readJson,
  serviceClient,
  userClient,
} from "../_shared/http.ts";

const SERVICIOS: Record<string, string> = {
  cobros_tarjeta: "Cobros con tarjeta",
  cuenta_spei: "Cuenta SPEI",
  domiciliacion: "Domiciliación",
  soporte: "Soporte",
};
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESPERA_AVISO_MS = 10 * 60_000;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

Deno.serve(
  handler(async (req) => {
    if (!bearerToken(req)) throw new HttpError(401, "Inicia sesión para enviar tu solicitud");
    const b = await readJson<Record<string, unknown>>(req);

    const servicio = texto(b.servicio);
    const nombre = texto(b.nombre);
    const telefono = texto(b.telefono);
    const correo = texto(b.correo).toLowerCase();
    const mensaje = texto(b.mensaje);
    const comercioId = texto(b.comercio_id);
    if (!SERVICIOS[servicio]) throw new HttpError(400, "Servicio inválido");
    if (nombre.length < 2 || nombre.length > 120) throw new HttpError(400, "Escribe tu nombre");
    const digitos = telefono.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 13 || telefono.length > 25) {
      throw new HttpError(400, "Escribe un teléfono de 10 dígitos");
    }
    if (!CORREO.test(correo) || correo.length > 160) {
      throw new HttpError(400, "Escribe un correo válido");
    }
    if (mensaje.length > 1000) throw new HttpError(400, "El mensaje es demasiado largo");
    if (comercioId && !UUID.test(comercioId)) throw new HttpError(400, "Comercio inválido");

    // 1. Guardar, como el usuario.
    const { data: id, error } = await userClient(req).rpc("solicitar_contacto", {
      p_servicio: servicio,
      p_nombre: nombre,
      p_telefono: telefono,
      p_correo: correo,
      p_mensaje: mensaje || null,
      p_comercio_id: comercioId || null,
    });
    if (error || typeof id !== "string") {
      const sinPermiso = error?.code === "42501";
      throw new HttpError(
        sinPermiso ? 403 : 400,
        sinPermiso
          ? "Tu sesión no corresponde a una cuenta de cliente"
          : "No se pudo guardar tu solicitud. Inténtalo de nuevo.",
      );
    }

    // 2. Avisar por correo (best-effort).
    try {
      await avisar(id);
    } catch (e) {
      console.error("solicitar-contacto: no se pudo avisar por correo:", (e as Error).message);
    }
    return json({ ok: true, id });
  }),
);

async function avisar(id: string): Promise<void> {
  const sb = serviceClient();
  const { data: s, error } = await sb
    .from("solicitudes_contacto")
    .select(
      "id, cliente_legajo, servicio, comercio_id, nombre, telefono, correo, mensaje, notificada_at, created_at, updated_at",
    )
    .eq("id", id)
    .single();
  if (error || !s) throw new Error(error?.message ?? "Solicitud inexistente");
  if (s.notificada_at && Date.now() - new Date(s.notificada_at).getTime() < ESPERA_AVISO_MS) return;

  const cfg = await configCorreo();
  if (!cfg.apiKey || !cfg.soporte) return; // Sin correo configurado: queda solo en el admin.

  const [{ data: cliente }, { data: comercio }] = await Promise.all([
    sb
      .from("clientes")
      .select("nombre, nombre_fantasia, nombre_legal")
      .eq("legajo", s.cliente_legajo)
      .maybeSingle(),
    s.comercio_id
      ? sb.from("comercios").select("nombre_comercio").eq("id", s.comercio_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  await sendEmail(
    solicitudContactoEmail(
      cfg.soporte,
      {
        servicio: SERVICIOS[s.servicio] ?? s.servicio,
        cliente:
          cliente?.nombre_fantasia || cliente?.nombre_legal || cliente?.nombre || s.cliente_legajo,
        legajo: s.cliente_legajo,
        comercio: (comercio as { nombre_comercio?: string | null } | null)?.nombre_comercio ?? null,
        nombre: s.nombre,
        telefono: s.telefono,
        correo: s.correo,
        mensaje: s.mensaje,
        actualizada: !!s.notificada_at,
      },
      cfg.adminUrl,
    ),
  );
  await sb
    .from("solicitudes_contacto")
    .update({ notificada_at: new Date().toISOString() })
    .eq("id", id);
}
