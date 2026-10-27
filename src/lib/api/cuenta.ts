import { getSignedDocUrls, requireSupabase } from "@/lib/supabase";
import type { Tables, TablesUpdate } from "@/lib/database.types";
import { DataAccessError } from "./errors";

/** Email del usuario autenticado (null sin sesión). */
export async function emailSesion(): Promise<string | null> {
  const sb = requireSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.email ?? null;
}

export type PerfilSesion = { email?: string; nombre?: string };

/** Nombre y email para el encabezado del portal. */
export async function getPerfilSesion(): Promise<PerfilSesion> {
  const sb = requireSupabase();
  const email = await emailSesion();
  if (!email) return {};
  const { data: cli, error } = await sb
    .from("clientes")
    .select("nombre, correo, nombre_fantasia")
    .eq("correo", email)
    .maybeSingle();
  // Sin ficha de cliente igual se muestra el email.
  if (error) return { email };
  return { email, nombre: cli ? cli.nombre_fantasia || cli.nombre : undefined };
}

export type Cliente = Tables<"clientes">;

/** Ficha completa del cliente de la sesión (null si no hay sesión o cliente). */
export async function getClienteSesion(): Promise<Cliente | null> {
  const sb = requireSupabase();
  const mail = await emailSesion();
  if (!mail) return null;
  const { data, error } = await sb.from("clientes").select("*").eq("correo", mail).maybeSingle();
  if (error) throw new DataAccessError(error);
  return data;
}

export async function updateCliente(
  legajo: string,
  patch: TablesUpdate<"clientes">,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("clientes").update(patch).eq("legajo", legajo);
  if (error) throw new DataAccessError(error);
}

export type DocumentoCliente = Pick<
  Tables<"documentos">,
  "tipo" | "url" | "label" | "created_at"
> & { signedUrl: string | null };

/** Documentos KYC del cliente (con URL firmada) y cantidad de movimientos del mes. */
export async function getResumenCuenta(
  legajo: string,
): Promise<{ documentos: DocumentoCliente[]; movimientosMes: number }> {
  const sb = requireSupabase();
  const { data: docs, error } = await sb
    .from("documentos")
    .select("tipo, url, label, created_at")
    .eq("cliente_legajo", legajo);
  if (error) throw new DataAccessError(error);
  const rawDocs = docs ?? [];
  const urls = await getSignedDocUrls(rawDocs.map((d) => d.url as string));
  const documentos = rawDocs.map((d) => ({
    ...d,
    signedUrl: d.url ? (urls[d.url] ?? null) : null,
  }));

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const { count, error: errCount } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("legajo", legajo)
    .gte("fecha", start.toISOString());
  if (errCount) throw new DataAccessError(errCount);
  return { documentos, movimientosMes: count ?? 0 };
}
