import { requireSupabase } from "@/lib/supabase";

/** Link de pago tal como lo devuelve la RPC pública `obtener_link_pago`. */
export type CheckoutLink = {
  id: string;
  url: string;
  estado: string;
  referencia: string | null;
  notas: string | null;
  expira_en: string | null;
  pagos_parciales: boolean;
  metodos_pago: string[];
  cliente_legajo: string;
  monto: number;
  detalle: Array<{ producto_nombre: string; cantidad: number; precio_unitario: number }>;
  comercio_id: string | null;
  comercio_nombre: string | null;
};

export type CheckoutBandera = { id: string; bandera: string };

export type CheckoutResultado =
  | { estado: "notfound" }
  | { estado: "inactive" | "expired"; link: CheckoutLink }
  | { estado: "ready"; link: CheckoutLink; banderas: CheckoutBandera[] | null };

/**
 * Resuelve el link público por código. Si está vigente suma una vista y trae
 * las banderas activas del comercio (`banderas` es null si el link no tiene comercio).
 */
export async function getCheckoutLink(code: string): Promise<CheckoutResultado> {
  const s = requireSupabase();
  console.log("[Checkout] code:", code);
  const { data: r, error: rpcErr } = await s.rpc("obtener_link_pago", { p_codigo: code });
  console.log("[Checkout] rpc result:", r, "error:", rpcErr);
  if (!r) return { estado: "notfound" };
  const d = r as unknown as CheckoutLink;

  const { data: linkRow } = await s
    .from("cliente_links_pago")
    .select("comercio_id, comercio_nombre")
    .eq("id", d.id)
    .maybeSingle();

  if (linkRow) {
    d.comercio_id = linkRow.comercio_id;
    d.comercio_nombre = linkRow.comercio_nombre;
  }

  if (d.estado === "Inactivo") return { estado: "inactive", link: d };
  if (d.expira_en && new Date(d.expira_en).getTime() < Date.now()) {
    return { estado: "expired", link: d };
  }
  await s.rpc("incrementar_vistas_link", { p_link_id: d.id });

  if (!d.comercio_id) return { estado: "ready", link: d, banderas: null };
  const { data: bandas } = await s
    .from("comercio_banderas")
    .select("id, bandera")
    .eq("comercio_id", d.comercio_id)
    .eq("estado", "Activo");
  console.log("[Checkout] bandas:", bandas);
  return { estado: "ready", link: d, banderas: bandas ?? [] };
}
