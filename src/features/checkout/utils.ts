import type { CheckoutLink } from "@/lib/api/checkout";
import { parseMonto } from "@/shared/format";

/** Total del link: suma del detalle si tiene productos; si no, el monto guardado. */
export function totalLink(d: Pick<CheckoutLink, "detalle" | "monto">): number {
  if (d.detalle?.length) {
    return d.detalle.reduce((a, p) => a + Number(p.precio_unitario) * Number(p.cantidad), 0);
  }
  return Number(d.monto ?? 0);
}

/** Monto tipeado, en el formato del país (puede devolver NaN). */
export { parseMonto };
