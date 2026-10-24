/**
 * Helpers centralizados para construir URLs de pago (checkout público /p/CODE
 * y rutas relacionadas /qr/pdv/ID).
 *
 * Single source of truth: `PAY_APP_ORIGIN` (variable VITE_PUBLIC_APP_URL). Así un link
 * copiado desde localhost o desde un preview siempre apunta al deploy de producción.
 *
 * Importante: la columna `cliente_links_pago.url` puede guardar branding
 * (`${brand.web.payLinksBase}/l/CODE`) o un origen viejo (localhost). Para
 * mostrar/copiar la URL resoluble real, usar `toResolvableLinkPagoUrl(urlGuardada)`.
 */

import { brand } from "@/brand/brand";

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/**
 * Origen público donde está desplegado el portal de empresas.
 *
 * Se toma de VITE_PUBLIC_APP_URL: los links de pago se generan y se copian con este dominio,
 * aunque el portal se esté viendo en localhost o en un preview. Si no está configurada, usa
 * el origen actual del navegador.
 */
export const PAY_APP_ORIGIN: string =
  import.meta.env.VITE_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : brand.web.website);

/** Origen con el que se construyen las URLs de pago. */
export const APP_ORIGIN: string = PAY_APP_ORIGIN;

/**
 * URL canónica de branding de la marca (subdominio pay). Solo marketing, no resuelve.
 * Sale de `brand.web.payLinksBase` (src/brand/brand.json). Si en el futuro se configura
 * DNS y deploy en ese dominio, se puede apuntar acá o leer de una env var.
 */
export const PAY_BRAND_BASE: string = brand.web.payLinksBase;

/** Construye la URL de branding (marketing, no resoluble). */
export const buildBrandingUrl = (code: string) => `${PAY_BRAND_BASE}/l/${code}`;

/** Construye la URL resoluble real del checkout público (/p/CODE). */
export const buildResolvableUrl = (code: string) => `${trimSlash(APP_ORIGIN)}/p/${code}`;

/** Construye la URL resoluble de un QR de punto de venta (/qr/pdv/ID). */
export const buildQrPdvUrl = (id: string) => `${trimSlash(APP_ORIGIN)}/qr/pdv/${id}`;

/**
 * Dada una URL guardada en DB (que puede ser branding o resoluble), devuelve la
 * URL resoluble real usando el CODE extraído.
 *
 * Acepta tanto `${brand.web.payLinksBase}/l/CODE` como `https://app.com/p/CODE`
 * o `http://localhost:8080/p/CODE`. Si no se puede extraer un CODE, devuelve
 * el string tal cual.
 */
export function toResolvableLinkPagoUrl(storedUrl: string): string {
  if (!storedUrl) return storedUrl;
  const code = storedUrl.split("/").pop();
  if (!code) return storedUrl;
  return buildResolvableUrl(code);
}
