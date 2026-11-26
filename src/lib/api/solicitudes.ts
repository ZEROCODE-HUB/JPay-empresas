import { requireSupabase } from "@/lib/supabase";
import { DataAccessError } from "./errors";

/**
 * Servicios que activa o atiende un ejecutivo (tabla `solicitudes_contacto`): el cliente deja sus
 * datos, la solicitud llega al admin y se avisa por correo al buzón de soporte.
 */
export type ServicioContacto = "domiciliacion" | "cobros_tarjeta" | "cuenta_spei" | "soporte";

export type SolicitudContacto = {
  id: string;
  nombre: string;
  telefono: string;
  correo: string;
  mensaje: string | null;
  estado: "nueva" | "contactado" | "descartada";
  createdAt: string;
};

/** Última solicitud del cliente de la sesión para ese servicio (y comercio, si se indica). */
export async function getUltimaSolicitud(
  servicio: ServicioContacto,
  comercioId?: string | null,
): Promise<SolicitudContacto | null> {
  const sb = requireSupabase();
  let q = sb
    .from("solicitudes_contacto")
    .select("id, nombre, telefono, correo, mensaje, estado, created_at")
    .eq("servicio", servicio);
  if (comercioId) q = q.eq("comercio_id", comercioId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new DataAccessError(error);
  if (!data) return null;
  return {
    id: data.id,
    nombre: data.nombre,
    telefono: data.telefono,
    correo: data.correo,
    mensaje: data.mensaje,
    estado: data.estado as SolicitudContacto["estado"],
    createdAt: data.created_at,
  };
}

/**
 * Deja (o actualiza, si ya hay una abierta) la solicitud del cliente. Va por la Edge Function
 * `solicitar-contacto`, que la guarda y además avisa por correo al equipo.
 */
export async function solicitarContacto(v: {
  servicio: ServicioContacto;
  nombre: string;
  telefono: string;
  correo: string;
  mensaje?: string;
  comercioId?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.functions.invoke("solicitar-contacto", {
    body: {
      servicio: v.servicio,
      nombre: v.nombre,
      telefono: v.telefono,
      correo: v.correo,
      mensaje: v.mensaje,
      comercio_id: v.comercioId ?? undefined,
    },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo = ctx ? await ctx.json().catch(() => null) : null;
    throw new DataAccessError(cuerpo?.error ? new Error(cuerpo.error) : error);
  }
}
