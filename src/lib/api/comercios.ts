import { requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { emailSesion } from "./cuenta";
import { DataAccessError } from "./errors";

export type ComercioClienteRow = Pick<
  Tables<"comercios">,
  "id" | "nombre_comercio" | "legajo" | "nivel" | "estado" | "usuario" | "created_at"
>;

/** Comercios asociados al cliente de la sesión (por legajo o por usuario = email). */
export async function listComerciosCliente(): Promise<ComercioClienteRow[] | null> {
  const s = requireSupabase();
  const mail = await emailSesion();
  if (!mail) return null;
  const { data: cli, error: errCli } = await s
    .from("clientes")
    .select("legajo")
    .eq("correo", mail)
    .maybeSingle();
  if (errCli) throw new DataAccessError(errCli);
  if (!cli?.legajo) return null;
  const { data, error } = await s
    .from("comercios")
    .select("id, nombre_comercio, legajo, nivel, estado, usuario, created_at")
    .or(`legajo.eq.${cli.legajo},usuario.eq.${mail}`)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error);
  return data;
}
