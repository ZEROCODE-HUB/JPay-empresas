import type { IntegracionEcommerceRow } from "@/lib/api/links-pago";
import { formatDateTime } from "@/shared/format";

export type Ecom = {
  id: string;
  name: string;
  estado: "Habilitado" | "Deshabilitado";
  created: string;
};

/** Catálogo de plataformas; estado y fecha se pisan con lo guardado en la base. */
export const ECOMS: Ecom[] = [
  { id: "shopify", name: "Shopify", estado: "Habilitado", created: "12 ago 2025, 11:52" },
  { id: "woocommerce", name: "WooCommerce", estado: "Habilitado", created: "10 jun 2025, 09:14" },
  { id: "magento", name: "Magento", estado: "Deshabilitado", created: "03 mar 2025, 16:30" },
  { id: "prestashop", name: "PrestaShop", estado: "Habilitado", created: "20 ene 2025, 08:45" },
  { id: "vtiger", name: "VTiger", estado: "Deshabilitado", created: "15 dic 2024, 14:00" },
  { id: "tiendanube", name: "Tiendanube", estado: "Habilitado", created: "05 nov 2024, 10:30" },
  {
    id: "mercadoshops",
    name: "Mercado Shops",
    estado: "Habilitado",
    created: "22 oct 2024, 11:20",
  },
  { id: "sellix", name: "Sellix", estado: "Deshabilitado", created: "08 sep 2024, 09:00" },
  { id: "bigcommerce", name: "BigCommerce", estado: "Habilitado", created: "01 ago 2024, 15:10" },
  { id: "opencart", name: "OpenCart", estado: "Deshabilitado", created: "14 jul 2024, 12:25" },
  { id: "wixstores", name: "Wix Stores", estado: "Habilitado", created: "30 jun 2024, 18:00" },
  { id: "ecwid", name: "Ecwid", estado: "Habilitado", created: "12 may 2024, 07:35" },
];

export const PAGE_SIZES = [10, 20, 50];

/** Une el catálogo con las integraciones guardadas del cliente (por `plataforma`). */
export function mergeIntegraciones(catalogo: Ecom[], rows: IntegracionEcommerceRow[]): Ecom[] {
  const map = new Map(rows.map((r) => [r.plataforma, r]));
  return catalogo.map((e) => {
    const r = map.get(e.id);
    if (!r) return e;
    return {
      ...e,
      estado: (r.estado ?? e.estado) as Ecom["estado"],
      created: r.created_at ? formatDateTime(r.created_at) : e.created,
    };
  });
}

/** Cambia el estado de una plataforma en la caché, agregando la fila si todavía no existe. */
export function conEstadoLocal(
  prev: IntegracionEcommerceRow[],
  plataforma: string,
  estado: Ecom["estado"],
  legajo: string,
): IntegracionEcommerceRow[] {
  return prev.some((r) => r.plataforma === plataforma)
    ? prev.map((r) => (r.plataforma === plataforma ? { ...r, estado } : r))
    : [
        ...prev,
        {
          id: "",
          cliente_legajo: legajo,
          plataforma,
          estado,
          created_at: "",
          api_key: null,
          webhook_url: null,
        },
      ];
}

/** Texto "desde–hasta" de la paginación (1-based; "0" si no hay filas). */
export function rangoPagina(page: number, pageSize: number, total: number) {
  return {
    desde: total === 0 ? "0" : String(page * pageSize + 1),
    hasta: Math.min((page + 1) * pageSize, total),
  };
}
