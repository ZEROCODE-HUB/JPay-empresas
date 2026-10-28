// Conexión de un comercio con un proveedor de pagos (OAuth): utilidades de las Edge Functions
// `ecartpay-oauth-*`. Solo en el repo del portal empresas.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { baseUrlEcartPay, EcartPayCliente } from "./ecartpay.ts";
import { HttpError, userClient } from "./http.ts";

export type Comercio = { id: string; legajo: string; nombre: string | null };

/**
 * Comercio del cliente que llama. Si se indica `comercioId`, tiene que ser suyo; si no, el
 * primero que tenga. 409 si la cuenta todavía no tiene un comercio dado de alta.
 */
export async function comercioDeSesion(
  req: Request,
  sb: SupabaseClient,
  comercioId?: string | null,
): Promise<Comercio> {
  const { data: legajo, error } = await userClient(req).rpc("current_cliente_legajo");
  if (error || typeof legajo !== "string" || !legajo) {
    throw new HttpError(403, "Solo un cliente con sesión puede conectar su cuenta");
  }
  let q = sb
    .from("comercios")
    .select("id, legajo, nombre_comercio")
    .eq("legajo", legajo)
    .order("created_at");
  if (comercioId) q = q.eq("id", comercioId);
  const { data, error: e2 } = await q.limit(1).maybeSingle();
  if (e2) throw new HttpError(500, e2.message);
  if (!data) {
    throw new HttpError(
      409,
      comercioId
        ? "El comercio no pertenece a tu cuenta"
        : "Tu cuenta todavía no tiene un comercio habilitado. Pedíselo a soporte.",
    );
  }
  return { id: data.id, legajo: data.legajo, nombre: data.nombre_comercio };
}

/**
 * URL del portal a la que se vuelve después de autorizar. Solo se aceptan el origen de
 * `APP_URL` y localhost (desarrollo); cualquier otra cosa cae en `APP_URL`, para no
 * convertir el callback en un redirector abierto.
 */
export function urlDeVuelta(pedida: unknown, ruta = "/app/integraciones"): string {
  const app = Deno.env.get("APP_URL")?.trim();
  const defecto = app ? new URL(ruta, app).toString() : null;
  if (typeof pedida === "string") {
    try {
      const u = new URL(pedida);
      const local = ["localhost", "127.0.0.1"].includes(u.hostname);
      const mismoApp = app ? u.origin === new URL(app).origin : false;
      if ((local && u.protocol === "http:") || mismoApp) return u.toString();
    } catch {
      // URL inválida: se usa la de la app
    }
  }
  if (!defecto) throw new HttpError(500, "Falta APP_URL en la configuración del servidor");
  return defecto;
}

/** Agrega parámetros de resultado a la URL de vuelta. */
export function conResultado(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export type ConexionActiva = {
  id: string;
  comercioId: string;
  entorno: "sandbox" | "produccion";
  publicId: string;
};

/** Conexión `conectado` con Ecart Pay de alguno de los comercios indicados (la más reciente). */
export async function conexionEcartPay(
  sb: SupabaseClient,
  comercioIds: string[],
): Promise<ConexionActiva | null> {
  if (comercioIds.length === 0) return null;
  const { data, error } = await sb
    .from("comercio_proveedores")
    .select("id, comercio_id, entorno, public_id")
    .in("comercio_id", comercioIds)
    .eq("proveedor", "ecartpay")
    .eq("estado", "conectado")
    .not("public_id", "is", null)
    .order("conectado_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) return null;
  return {
    id: data.id,
    comercioId: data.comercio_id,
    entorno: data.entorno as ConexionActiva["entorno"],
    publicId: data.public_id as string,
  };
}

/** Cliente de Ecart Pay que opera con las claves del comercio (la privada sale de Vault). */
export async function clienteDeConexion(
  sb: SupabaseClient,
  c: ConexionActiva,
): Promise<EcartPayCliente> {
  const { data: privada, error } = await sb.rpc("proveedor_leer_secreto", {
    p_conexion_id: c.id,
  });
  if (error) throw new HttpError(500, error.message);
  if (typeof privada !== "string" || !privada) {
    throw new HttpError(409, "La conexión con Ecart Pay no tiene claves; hay que reconectarla");
  }
  return new EcartPayCliente({
    baseUrl: baseUrlEcartPay(c.entorno === "sandbox"),
    credenciales: { publicKey: c.publicId, privateKey: privada },
  });
}
