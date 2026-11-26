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

export type LinkPagoResumen = Pick<LinkPagoRow, "id" | "monto" | "estado" | "url" | "referencia">;

/** Totales de los cobros de links de un entorno y una moneda (función `portal_resumen_links`). */
export type GrupoLinks = {
  entorno: string;
  moneda: string;
  operaciones: number;
  aprobados: number;
  monto_aprobado: number;
  pendientes: number;
  rechazados: number;
  reembolsados: number;
};
export type CobradoLink = {
  link_id: string;
  entorno: string;
  moneda: string;
  cobrado: number;
  pagos: number;
};

export type DashboardLinksPago = {
  grupos: GrupoLinks[];
  porLink: CobradoLink[];
  links: LinkPagoResumen[];
};

/**
 * Cobros de los links de pago de los últimos `days` días (calculados por la base, desde los
 * pagos con tarjeta) y los links del cliente.
 */
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

  const [res, lk] = await Promise.all([
    s.rpc("portal_resumen_links", { p_desde: start.toISOString(), p_hasta: end.toISOString() }),
    s
      .from("cliente_links_pago")
      .select("id, monto, estado, url, referencia")
      .eq("cliente_legajo", legajo),
  ]);
  if (res.error) throw new DataAccessError(res.error);
  if (lk.error) throw new DataAccessError(lk.error);
  const r = res.data as unknown as { grupos: GrupoLinks[]; por_link: CobradoLink[] };
  return { grupos: r.grupos ?? [], porLink: r.por_link ?? [], links: lk.data ?? [] };
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

export type NuevoLinkPago = {
  comercio_id: string;
  /** URL de ejemplo con el origen del portal; el servidor pone el código. */
  url_base: string;
  estado: string;
  referencia: string | null;
  notas: string | null;
  expira_en: string | null;
  pagos_parciales: boolean;
  metodos_pago: string[];
  moneda: string;
};

/**
 * Crea el link con sus productos en el servidor (función `crear_link_pago`, migración 1069): el
 * código es aleatorio y único, el precio sale del catálogo y todo se guarda junto o nada.
 */
export async function crearLinkPago(
  link: NuevoLinkPago,
  productos: { producto_id: string; cantidad: number }[],
): Promise<{ id: string; url: string; codigo: string; monto: number }> {
  const s = requireSupabase();
  const { data, error } = await s.rpc("crear_link_pago", {
    p_link: link,
    p_productos: productos,
  });
  if (error || !data) throw new DataAccessError(error ?? new Error("Sin datos"));
  const r = data as { id: string; url: string; codigo: string; monto: number };
  return { ...r, monto: Number(r.monto) };
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
