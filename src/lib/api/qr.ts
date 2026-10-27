import { requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { getEmailUsuarioActual } from "./auth";
import { DataAccessError } from "./errors";

// ============================================================================
// Puntos de venta
// ============================================================================

export type EstadoPdv = "Activado" | "Desactivado";

export type PuntoVenta = {
  id: string;
  nombre: string;
  estado: EstadoPdv;
  created_at: string;
};

/**
 * Comercio del usuario actual (por legajo del cliente). Si el cliente no tiene comercio
 * todavía, lo crea para poder vincular PDVs. Devuelve el mensaje a mostrar si no se pudo.
 */
export async function resolverComercioQr(): Promise<{ id: string | null; error?: string }> {
  const s = requireSupabase();
  const mail = await getEmailUsuarioActual();
  if (!mail) return { id: null, error: "No se pudo obtener el correo del usuario" };
  const { data: cli, error: cliErr } = await s
    .from("clientes")
    .select("legajo")
    .eq("correo", mail)
    .maybeSingle();
  if (cliErr) {
    console.error("Error buscando cliente:", cliErr);
    return { id: null, error: "Error al buscar el cliente asociado" };
  }
  if (!cli?.legajo) return { id: null, error: "No se encontró un cliente asociado a este usuario" };

  const { data: com, error: comErr } = await s
    .from("comercios")
    .select("id")
    .eq("legajo", cli.legajo)
    .maybeSingle();
  if (comErr) {
    console.error("Error buscando comercio:", comErr);
    return { id: null, error: "Error al buscar el comercio" };
  }
  if (com?.id) return { id: com.id };

  const { data: nuevo, error } = await s
    .from("comercios")
    .insert({ usuario: mail, legajo: cli.legajo, estado: "Activado", nivel: "Estándar" })
    .select("id")
    .single();
  if (error) {
    console.error("Error creando comercio:", error);
    return {
      id: null,
      error: "No se pudo crear el comercio. Verificá tu cuenta o contactá soporte.",
    };
  }
  return { id: nuevo?.id ?? null };
}

export async function listPuntosVenta(comercioId: string): Promise<PuntoVenta[]> {
  const s = requireSupabase();
  const { data, error } = await s
    .from("puntos_venta")
    .select("id, nombre, estado, created_at")
    .eq("comercio_id", comercioId)
    .order("created_at", { ascending: true });
  if (error) throw new DataAccessError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    estado: r.estado as EstadoPdv,
    created_at: r.created_at,
  }));
}

export async function crearPuntoVenta(comercioId: string, nombre: string): Promise<void> {
  const s = requireSupabase();
  const { error } = await s.from("puntos_venta").insert({
    comercio_id: comercioId,
    nombre,
    estado: "Pendiente de aprobación",
  });
  if (error) throw new DataAccessError(error);
}

export async function actualizarPuntoVenta(
  id: string,
  cambios: { nombre: string; estado: EstadoPdv },
): Promise<void> {
  const s = requireSupabase();
  const { error } = await s.from("puntos_venta").update(cambios).eq("id", id);
  if (error) throw new DataAccessError(error);
}

export async function eliminarPuntoVenta(id: string): Promise<void> {
  const s = requireSupabase();
  const { error } = await s.from("puntos_venta").delete().eq("id", id);
  if (error) throw new DataAccessError(error);
}

// ============================================================================
// Dashboard de cobros QR
// ============================================================================

export type CobroQr = Pick<Tables<"transactions">, "monto_operacion" | "estado_id" | "fecha">;
export type EstadoMovimiento = Pick<Tables<"estados_movimiento">, "id" | "nombre">;

export type DashboardQrDatos = {
  cobros: CobroQr[];
  /** Error al leer los cobros: el resto del dashboard se muestra igual. */
  cobrosError: DataAccessError | null;
  estados: EstadoMovimiento[] | null;
  pdvsPorEstado: Record<string, number>;
};

/** Cobros QR desde `sinceIso` + PDVs por estado del comercio del usuario actual. */
export async function getDashboardQr(sinceIso: string): Promise<DashboardQrDatos | null> {
  const s = requireSupabase();
  const mail = await getEmailUsuarioActual();
  if (!mail) return null;
  const { data: cli } = await s.from("clientes").select("legajo").eq("correo", mail).maybeSingle();
  if (!cli?.legajo) return null;
  const legajo = cli.legajo;

  const [{ data: movs, error }, { data: estados }] = await Promise.all([
    s
      .from("transactions")
      .select("monto_operacion, estado_id, fecha")
      .eq("legajo", legajo)
      .eq("tipo", "cobro_pct")
      .gte("fecha", sinceIso),
    s.from("estados_movimiento").select("id, nombre"),
  ]);

  const { data: com } = await s.from("comercios").select("id").eq("legajo", legajo).maybeSingle();
  const pdvsPorEstado: Record<string, number> = {};
  if (com?.id) {
    const { data: pdvs } = await s.from("puntos_venta").select("estado").eq("comercio_id", com.id);
    for (const p of pdvs ?? []) {
      pdvsPorEstado[p.estado] = (pdvsPorEstado[p.estado] ?? 0) + 1;
    }
  }

  return {
    cobros: movs ?? [],
    cobrosError: error ? new DataAccessError(error) : null,
    estados,
    pdvsPorEstado,
  };
}
