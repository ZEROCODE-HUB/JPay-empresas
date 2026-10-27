import { requireSupabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";
import { getEmailUsuarioActual } from "./auth";
import { DataAccessError } from "./errors";

export type ProductoRow = Tables<"productos">;
export type LinkPagoRow = Tables<"cliente_links_pago">;
export type LinkPagoDetalleRow = Tables<"cliente_links_pago_detalle">;
export type IntegracionEcommerceRow = Tables<"cliente_integraciones_ecommerce">;

export type ComercioBanderaRow = {
  id: string;
  bandera: string;
  estado: string;
  metodo_key: string | null;
};

export type ComercioUsuario = { id: string; nombre_comercio: string | null };

/** Cliente (por legajo) del usuario logueado. null si no hay sesión o no tiene cliente. */
export type ClienteActual = { mail: string; legajo: string };

export async function getClienteActual(): Promise<ClienteActual | null> {
  const mail = await getEmailUsuarioActual();
  if (!mail) return null;
  const sb = requireSupabase();
  const { data: cli } = await sb.from("clientes").select("legajo").eq("correo", mail).maybeSingle();
  if (!cli) return null;
  return { mail, legajo: cli.legajo };
}

// ============================================================================
// Dashboard
// ============================================================================

export type MovimientoTarjeta = { monto: number; fecha: string; estado: string; id: string };
export type LinkPagoResumen = Pick<LinkPagoRow, "id" | "monto" | "estado" | "url">;

export type DashboardLinksPago = { movs: MovimientoTarjeta[]; links: LinkPagoResumen[] };

/** Cobros con tarjeta de los últimos `days` días y links del cliente. Errores silenciosos. */
export async function getDashboardLinksPago(
  legajo: string,
  days: number,
): Promise<DashboardLinksPago> {
  const s = requireSupabase();
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - (days === 0 ? 0 : days - 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const { data: m } = await s
    .from("transactions")
    .select("monto_operacion, fecha, estado_id, id_txn")
    .eq("legajo", legajo)
    .eq("tipo", "tarjeta")
    .gte("fecha", start.toISOString())
    .lte("fecha", end.toISOString());

  // transactions.estado_id → estados_movimiento.id; el código se agrupa en las categorías del dashboard.
  const ids = Array.from(new Set((m ?? []).map((x) => x.estado_id)));
  const codigoPorId: Record<number, string> = {};
  if (ids.length) {
    const { data: est } = await s.from("estados_movimiento").select("id, codigo").in("id", ids);
    (est ?? []).forEach((e) => (codigoPorId[e.id] = e.codigo));
  }
  const movs = (m ?? []).map((x) => ({
    monto: Math.abs(Number(x.monto_operacion ?? 0)),
    fecha: x.fecha,
    estado: categoriaDashboard(codigoPorId[x.estado_id]),
    id: x.id_txn ?? x.fecha,
  }));

  const { data: lk } = await s
    .from("cliente_links_pago")
    .select("id, monto, estado, url")
    .eq("cliente_legajo", legajo);
  return { movs, links: lk ?? [] };
}

// ============================================================================
// Productos
// ============================================================================

export async function listProductos(legajo: string): Promise<ProductoRow[]> {
  const s = requireSupabase();
  const { data } = await s
    .from("productos")
    .select("*")
    .eq("cliente_legajo", legajo)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function crearProducto(payload: TablesInsert<"productos">): Promise<void> {
  const s = requireSupabase();
  const { error } = await s.from("productos").insert(payload);
  if (error) throw new DataAccessError(error);
}

export async function actualizarProducto(
  id: string,
  payload: TablesUpdate<"productos">,
): Promise<void> {
  const s = requireSupabase();
  const { error } = await s.from("productos").update(payload).eq("id", id);
  if (error) throw new DataAccessError(error);
}

export async function eliminarProducto(id: string): Promise<void> {
  const s = requireSupabase();
  const { error } = await s.from("productos").delete().eq("id", id);
  if (error) throw new DataAccessError(error);
}

// ============================================================================
// Links de pago
// ============================================================================

export type LinkPagoConDetalle = LinkPagoRow & { detalle: LinkPagoDetalleRow[] };

export async function listLinksPago(legajo: string): Promise<LinkPagoConDetalle[]> {
  const s = requireSupabase();
  const { data: lks } = await s
    .from("cliente_links_pago")
    .select("*")
    .eq("cliente_legajo", legajo)
    .order("created_at", { ascending: false });
  const lk = lks ?? [];
  const ids = lk.map((x) => x.id);
  let det: LinkPagoDetalleRow[] = [];
  if (ids.length) {
    const { data: d } = await s.from("cliente_links_pago_detalle").select("*").in("link_id", ids);
    det = d ?? [];
  }
  const byLink = new Map<string, LinkPagoDetalleRow[]>();
  det.forEach((d) => {
    const arr = byLink.get(d.link_id) ?? [];
    arr.push(d);
    byLink.set(d.link_id, arr);
  });
  return lk.map((x) => ({ ...x, detalle: byLink.get(x.id) ?? [] }));
}

/**
 * Crea el link y su detalle. Lanza si falla el alta del link; si falla solo el
 * detalle, el link queda creado y se informa con `detalleOk: false`.
 */
export async function crearLinkPago(
  link: TablesInsert<"cliente_links_pago">,
  detalle: Omit<TablesInsert<"cliente_links_pago_detalle">, "link_id">[],
): Promise<{ id: string; detalleOk: boolean }> {
  const s = requireSupabase();
  const { data: inserted, error } = await s
    .from("cliente_links_pago")
    .insert(link)
    .select()
    .single();
  if (error || !inserted) throw new DataAccessError(error ?? new Error("Sin datos"));
  const { error: e2 } = await s
    .from("cliente_links_pago_detalle")
    .insert(detalle.map((d) => ({ ...d, link_id: inserted.id })));
  return { id: inserted.id, detalleOk: !e2 };
}

export async function actualizarLinkPago(
  id: string,
  patch: TablesUpdate<"cliente_links_pago">,
): Promise<void> {
  const s = requireSupabase();
  const { error } = await s.from("cliente_links_pago").update(patch).eq("id", id);
  if (error) throw new DataAccessError(error);
}

export async function eliminarLinkPago(id: string): Promise<void> {
  const s = requireSupabase();
  const { error } = await s.from("cliente_links_pago").delete().eq("id", id);
  if (error) throw new DataAccessError(error);
}

/** Comercios del usuario: por legajo o por usuario (mail). */
export async function listComerciosUsuario(
  legajo: string,
  mail: string,
): Promise<ComercioUsuario[]> {
  const s = requireSupabase();
  const { data: com } = await s
    .from("comercios")
    .select("id, nombre_comercio")
    .or(`legajo.eq.${legajo},usuario.eq.${mail}`);
  return com ?? [];
}

/** Banderas activas de un comercio (para elegir métodos al generar un link). */
export async function listBanderasActivasComercio(
  comercioId: string,
): Promise<ComercioBanderaRow[]> {
  const s = requireSupabase();
  const { data } = await s
    .from("comercio_banderas")
    .select("id, bandera, estado, metodo_key")
    .eq("comercio_id", comercioId)
    .eq("estado", "Activo");
  return data ?? [];
}

/** Nombres de las banderas activas de un comercio (detalle de un link). */
export async function listNombresBanderasComercio(comercioId: string): Promise<string[]> {
  const s = requireSupabase();
  const { data } = await s
    .from("comercio_banderas")
    .select("id, bandera")
    .eq("comercio_id", comercioId)
    .eq("estado", "Activo");
  return (data ?? []).map((b) => b.bandera);
}

// ============================================================================
// Integraciones e-commerce
// ============================================================================

export async function listIntegracionesEcommerce(
  legajo: string,
): Promise<IntegracionEcommerceRow[]> {
  const s = requireSupabase();
  const { data } = await s
    .from("cliente_integraciones_ecommerce")
    .select("*")
    .eq("cliente_legajo", legajo);
  return data ?? [];
}

export async function getClaveIntegracionEcommerce(
  legajo: string,
  plataforma: string,
): Promise<{ api_key: string | null; webhook_url: string | null } | null> {
  const s = requireSupabase();
  const { data } = await s
    .from("cliente_integraciones_ecommerce")
    .select("api_key, webhook_url")
    .eq("cliente_legajo", legajo)
    .eq("plataforma", plataforma)
    .maybeSingle();
  return data;
}

export async function upsertIntegracionEcommerce(
  legajo: string,
  plataforma: string,
  patch: Omit<TablesInsert<"cliente_integraciones_ecommerce">, "cliente_legajo" | "plataforma">,
): Promise<void> {
  const s = requireSupabase();
  const { error } = await s
    .from("cliente_integraciones_ecommerce")
    .upsert(
      { cliente_legajo: legajo, plataforma, ...patch },
      { onConflict: "cliente_legajo,plataforma" },
    );
  if (error) throw new DataAccessError(error);
}

const CATEGORIA_POR_CODIGO: Record<string, string> = {
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  BLOQUEADO: "Rechazado",
  EXPIRADO: "Rechazado",
  REEMBOLSADO: "Reembolsado",
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "Pendiente",
  CREADO: "Pendiente",
  ABIERTO: "Pendiente",
};

/** Categoría del dashboard (Aprobado / Pendiente / Rechazado / Reembolsado) según el código del estado. */
function categoriaDashboard(codigo: string | undefined): string {
  return (codigo && CATEGORIA_POR_CODIGO[codigo]) || "Pendiente";
}
