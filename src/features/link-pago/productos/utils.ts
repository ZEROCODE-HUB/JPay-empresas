import type { Product, PaymentLink } from "@/data/links-pago";
import type { ComercioBanderaRow, LinkPagoConDetalle, ProductoRow } from "@/lib/api/links-pago";
import { toResolvableLinkPagoUrl } from "@/lib/pay-url";
import { parseMonto } from "@/shared/format";

export type ComercioBandera = ComercioBanderaRow & { methodId: string };

export const LINKS_PAGE_SIZE = 10;

/**
 * Normaliza el texto de una bandera al id de método que usa el checkout.
 * Solo se usa como fallback cuando `comercio_banderas.metodo_key` viene null.
 */
const BANDERA_FALLBACK_METHOD: Record<string, string> = {
  visa: "visa-cred",
  "visa crédito": "visa-cred",
  "visa débito": "visa-deb",
  "visa prepaga": "visa-deb",
  mastercard: "mc-cred",
  "mastercard crédito": "mc-cred",
  "mastercard débito": "mc-deb",
  "mastercard prepaga": "mc-deb",
  amex: "amex",
  "american express": "amex",
  cabal: "cabal-cred",
  "cabal crédito": "cabal-cred",
  "cabal débito": "cabal-deb",
  naranja: "naranja",
  "naranja x": "naranja",
  diners: "diners",
  maestro: "maestro",
};

export function methodIdFromBandera(bandera: string): string {
  const key = bandera.trim().toLowerCase();
  return BANDERA_FALLBACK_METHOD[key] ?? key.replace(/\s+/g, "_");
}

/**
 * Un comercio puede tener varias filas que apuntan al mismo metodo
 * (ej. "Visa" y "Visa Crédito" -> visa-cred). Se muestra una sola vez.
 */
export function banderasUnicas(banderas: ComercioBanderaRow[]): ComercioBandera[] {
  const byMethod = new Map<string, ComercioBandera>();
  banderas.forEach((b) => {
    const methodId = b.metodo_key || methodIdFromBandera(b.bandera);
    if (!byMethod.has(methodId)) byMethod.set(methodId, { ...b, methodId });
  });
  return Array.from(byMethod.values());
}

/** Estado que se muestra: un link "Activo" con la fecha de expiracion pasada figura "Vencido". */
export function linkDisplayStatus(l: PaymentLink, ahora: number = Date.now()): string {
  if (l.status === "Activo" && l.expiresAt) {
    const parts = l.expiresAt.split("/");
    if (parts.length === 3) {
      const exp = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T23:59:59`);
      if (exp.getTime() < ahora) return "Vencido";
    }
  }
  return l.status;
}

export function toProduct(r: ProductoRow): Product {
  return {
    id: r.id,
    name: r.nombre,
    qty: Number(r.cantidad ?? 1),
    price: Number(r.precio ?? 0),
    desc: r.descripcion ?? undefined,
  };
}

/** "YYYY-MM-DD..." -> "DD/MM/YYYY". */
const isoADmy = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/**
 * Expiracion guardada (ISO, timestamptz) -> "DD/MM/YYYY" en hora local.
 *
 * Se guarda como fin del dia local (`expiraEnIso`), que en UTC puede caer al
 * dia siguiente: cortar el texto del ISO mostraria un dia de mas.
 */
export function expiraEnDmy(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return isoADmy(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** "DD/MM/YYYY" -> "YYYY-MM-DD" (valor de un `<input type="date">`). */
export const dmyAIso = (dmy: string) => dmy.split("/").reverse().join("-");

export function toPaymentLink(x: LinkPagoConDetalle): PaymentLink {
  const prods: Product[] = x.detalle.map((d) => ({
    id: d.producto_id ?? d.id,
    name: d.producto_nombre,
    qty: Number(d.cantidad ?? 1),
    price: Number(d.precio_unitario ?? 0),
  }));
  return {
    id: x.id,
    // La URL guardada puede ser branding (brand.web.payLinksBase) o un origen
    // viejo (localhost). Se reconstruye con el dominio de producción para
    // que "Copiar" y el detalle apunten siempre al deploy.
    url: toResolvableLinkPagoUrl(x.url ?? ""),
    products: prods,
    status: (x.estado ?? "Activo") as PaymentLink["status"],
    partialPayments: !!x.pagos_parciales,
    methods: Array.isArray(x.metodos_pago)
      ? x.metodos_pago.filter((m): m is string => typeof m === "string")
      : [],
    reference: x.referencia ?? undefined,
    notes: x.notas ?? undefined,
    createdAt: isoADmy(x.created_at ?? ""),
    expiresAt: x.expira_en ? expiraEnDmy(x.expira_en) : undefined,
    views: Number(x.vistas ?? 0),
    payments: Number(x.pagos ?? 0),
    comercioId: x.comercio_id ?? undefined,
    comercioNombre: x.comercio_nombre ?? undefined,
  };
}

/** Suma precio × cantidad. */
export function montoProductos(products: Array<Pick<Product, "price" | "qty">>): number {
  return products.reduce((s, p) => s + p.price * p.qty, 0);
}

/** Fecha del `<input type="date">` -> ISO al final del dia local (o null si esta vacia). */
export function expiraEnIso(fecha: string): string | null {
  return fecha ? new Date(fecha + "T23:59:59").toISOString() : null;
}

/** Codigo visible del link: el ultimo segmento de la URL. */
export function codigoLink(l: Pick<PaymentLink, "url" | "id">): string {
  return l.url.split("/").pop() ?? l.id;
}

/** Codigo aleatorio de un link nuevo ("LP-XXXXXX"). */
export function nuevoCodigoLink(): string {
  return "LP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

/** Precio tipeado en el formato del país ("29,900.50" en México); 0 si no es un número. */
export function parsePrecio(price: string): number {
  return parseMonto(price.replace(/[^0-9.,]/g, "")) || 0;
}

/** Texto en minusculas y sin acentos, para comparar busquedas. */
const normalizarBusqueda = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function coincide(campos: Array<string | undefined | null>, busqueda: string): boolean {
  const q = normalizarBusqueda(busqueda.trim());
  if (!q) return true;
  return campos.some((c) => !!c && normalizarBusqueda(c).includes(q));
}

/** Productos cuyo nombre o descripcion contienen la busqueda. */
export function filtrarProductos(products: Product[], busqueda: string): Product[] {
  return products.filter((p) => coincide([p.name, p.desc], busqueda));
}

/**
 * Links cuyo codigo, productos (nombre), referencia, observaciones o comercio
 * contienen la busqueda.
 */
export function filtrarLinks(links: PaymentLink[], busqueda: string): PaymentLink[] {
  return links.filter((l) =>
    coincide(
      [codigoLink(l), l.reference, l.notes, l.comercioNombre, ...l.products.map((p) => p.name)],
      busqueda,
    ),
  );
}

export type PaginaLinks<T> = { items: T[]; page: number; totalPages: number; total: number };

/** Pagina acotada al rango valido. */
export function paginarLinks<T>(items: T[], page: number, pageSize: number): PaginaLinks<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(page, totalPages);
  return {
    items: items.slice((safe - 1) * pageSize, safe * pageSize),
    page: safe,
    totalPages,
    total,
  };
}
