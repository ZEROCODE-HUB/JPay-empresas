// Edge Function (solo admins): configuración del correo saliente por Resend desde el panel
// (Sistema › Integraciones › Correo). Body: { accion, … }.
//
// - `estado`: si hay clave (y de dónde sale), remitente, buzón de solicitudes, última prueba.
//   Nunca devuelve la clave: solo sus últimos 4 caracteres.
// - `guardar` { clave?, remitente?, destino? }: valida la clave contra Resend antes de guardarla
//   (va a Vault). Si no hay remitente configurado y la cuenta de Resend tiene un dominio
//   verificado, lo propone solo («Marca <no-reply@dominio>»). Campo ausente = no cambia; cadena
//   vacía en remitente/destino = se borra.
// - `quitar_clave`: borra la clave guardada en el panel (el correo vuelve a modo demo, salvo que
//   exista el secreto de entorno RESEND_API_KEY).
// - `probar` { para? }: manda un correo de prueba (por defecto, al admin que lo pide) y guarda el
//   resultado.

import { configCorreo, olvidarConfigCorreo, pruebaEmail, sendEmail } from "../_shared/email.ts";
import {
  esAdmin,
  handler,
  HttpError,
  json,
  readJson,
  serviceClient,
  userClient,
} from "../_shared/http.ts";
import { brand } from "../_shared/brand.ts";

const CORREO = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
/** «correo@dominio» o «Nombre <correo@dominio>». */
const REMITENTE =
  /^(?:[^<>@]{1,80}<\s*[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+\s*>|[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)$/;

type Dominio = { name?: string; status?: string };

Deno.serve(
  handler(async (req) => {
    if (!(await esAdmin(req))) throw new HttpError(403, "Solo para administradores");
    const b = await readJson<Record<string, unknown>>(req);
    const sb = serviceClient();
    const { data: auth } = await userClient(req).auth.getUser();
    const quien = auth?.user?.email ?? "admin";

    switch (b.accion) {
      case "estado":
        return json(await estado());

      case "guardar": {
        const clave = typeof b.clave === "string" ? b.clave.trim() : null;
        const remitente = typeof b.remitente === "string" ? b.remitente.trim() : null;
        const destino = typeof b.destino === "string" ? b.destino.trim().toLowerCase() : null;
        if (remitente && !REMITENTE.test(remitente)) {
          throw new HttpError(400, "El remitente debe ser «Nombre <correo@dominio>» o un correo");
        }
        if (destino && !CORREO.test(destino)) {
          throw new HttpError(400, "El correo que recibe las solicitudes no es válido");
        }

        let dominios: string[] = [];
        if (clave) {
          if (!/^re_[A-Za-z0-9_-]{10,200}$/.test(clave)) {
            throw new HttpError(400, "No parece una clave de Resend (empiezan con «re_»)");
          }
          dominios = await validarClave(clave);
        }

        // Remitente automático: si nadie configuró uno y la cuenta tiene un dominio verificado.
        const previa = await configCorreo();
        const sinRemitente = remitente === null && previa.fromDePrueba;
        const remitenteFinal =
          sinRemitente && dominios.length
            ? `${brand.email.fromName} <no-reply@${dominios[0]}>`
            : remitente;

        const { error } = await sb.rpc("correo_guardar_config", {
          p_remitente: remitenteFinal,
          p_destino: destino,
          p_clave: clave,
          p_por: quien,
          p_admin_url: origenDelPanel(req),
        });
        if (error) throw new HttpError(500, error.message);
        olvidarConfigCorreo();
        return json({ ...(await estado()), dominios_verificados: dominios });
      }

      case "quitar_clave": {
        const { error } = await sb.rpc("correo_quitar_clave", { p_por: quien });
        if (error) throw new HttpError(500, error.message);
        olvidarConfigCorreo();
        return json(await estado());
      }

      case "probar": {
        olvidarConfigCorreo();
        const cfg = await configCorreo();
        if (!cfg.apiKey) throw new HttpError(409, "Primero carga la clave de Resend");
        const para =
          typeof b.para === "string" && b.para.trim() ? b.para.trim() : auth?.user?.email;
        if (!para || !CORREO.test(para)) throw new HttpError(400, "Escribe un correo de destino");
        let ok = true;
        let detalle = `Enviado a ${para} desde ${cfg.from}`;
        try {
          await sendEmail(pruebaEmail(para));
        } catch (e) {
          ok = false;
          detalle = (e as Error).message;
        }
        await sb.rpc("correo_registrar_prueba", { p_ok: ok, p_detalle: detalle });
        olvidarConfigCorreo();
        return json({ ...(await estado()), prueba: { ok, detalle } });
      }

      default:
        throw new HttpError(400, "Acción inválida");
    }
  }),
);

/** Estado para el panel, sin secretos. */
async function estado() {
  const c = await configCorreo();
  return {
    configurado: !!c.apiKey,
    origen_clave: c.origenClave,
    pista: c.pista,
    remitente: c.from,
    remitente_de_prueba: c.fromDePrueba,
    destino: c.soporte,
    probado: c.probado,
    actualizado: c.actualizado,
    // Lo que venga de secretos de entorno no se puede cambiar desde el panel.
    remitente_fijo: !!Deno.env.get("RESEND_FROM")?.trim(),
    destino_fijo: !!Deno.env.get("SOPORTE_EMAIL")?.trim(),
  };
}

/**
 * Comprueba la clave contra Resend y devuelve sus dominios verificados. Una clave de «solo envío»
 * no puede listar dominios (401 `restricted_api_key`): es válida, se guarda sin dominios.
 */
async function validarClave(clave: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${clave}` },
    });
  } catch {
    throw new HttpError(502, "No se pudo contactar a Resend para validar la clave");
  }
  const cuerpo = (await res.json().catch(() => null)) as {
    data?: Dominio[];
    name?: string;
    message?: string;
  } | null;
  if (res.ok) {
    return (cuerpo?.data ?? [])
      .filter((d) => d.status === "verified" && typeof d.name === "string")
      .map((d) => d.name as string);
  }
  if (cuerpo?.name === "restricted_api_key") return [];
  if (res.status === 401 || res.status === 403) {
    throw new HttpError(422, "Resend no aceptó la clave: revisa que esté completa y activa");
  }
  throw new HttpError(502, `Resend respondió ${res.status}: ${cuerpo?.message ?? "sin detalle"}`);
}

/** Origen https del panel desde el que se configura (para los enlaces de los avisos). */
function origenDelPanel(req: Request): string | null {
  const o = req.headers.get("Origin")?.trim();
  if (!o) return null;
  try {
    const u = new URL(o);
    if (u.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}
