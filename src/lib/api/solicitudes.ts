import { requireSupabase } from "@/lib/supabase";
import { DataAccessError } from "./errors";

/** Servicios que JPay atiende con un ejecutivo (tabla `solicitudes_contacto`). */
export type ServicioContacto = "domiciliacion";

export type SolicitudContacto = {
  id: string;
  nombre: string;
  telefono: string;
  correo: string;
  mensaje: string | null;
  estado: "nueva" | "contactado" | "descartada";
  createdAt: string;
};

/** Última solicitud del comercio de la sesión para ese servicio (o null). */
export async function getUltimaSolicitud(
  servicio: ServicioContacto,
): Promise<SolicitudContacto | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("solicitudes_contacto")
    .select("id, nombre, telefono, correo, mensaje, estado, created_at")
    .eq("servicio", servicio)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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

/** Deja (o actualiza, si ya hay una abierta) la solicitud de contacto del comercio. */
export async function solicitarContacto(v: {
  servicio: ServicioContacto;
  nombre: string;
  telefono: string;
  correo: string;
  mensaje?: string;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("solicitar_contacto", {
    p_servicio: v.servicio,
    p_nombre: v.nombre,
    p_telefono: v.telefono,
    p_correo: v.correo,
    p_mensaje: v.mensaje,
  });
  if (error) throw new DataAccessError(error);
}
