/**
 * Identidad de marca de la app. Todo texto visible que nombre a la marca, a la empresa o a sus
 * contactos debe salir de acá, nunca escrito a mano en un componente.
 *
 * - Textos, contactos, dominios y colores: `brand.json` (ver BRANDING.md).
 * - Imágenes: `./assets/` (se reemplazan manteniendo el nombre de archivo).
 * - Colores en CSS: clases `primary-*`, `secondary-*`, `highlight-*` (marca) y `danger-*`
 *   (errores). Para canvas/PDF usar `resolveColor` de `./colors`.
 */
import data from "./brand.json";
import logoSrc from "./assets/logo.svg";
import logoLightSrc from "./assets/logo-light.svg";
import isotipoSrc from "./assets/isotipo.svg";
import ogImageSrc from "./assets/og-image.png";
import heroSrc from "./assets/hero.webp";
import landingDashboardSrc from "./assets/landing-dashboard.png";
import loginHeroSrc from "./assets/login-hero.jpg";

export const brand = {
  name: data.name,
  shortName: data.shortName,
  tagline: data.tagline,
  description: data.description,
  regulatoryNote: data.regulatoryNote,
  company: data.company,
  contact: data.contact,
  web: data.web,
  /** Hojas de estilo de las tipografías de la marca (se cargan en __root). */
  fontStylesheets: data.fonts.stylesheets,
  assets: {
    /** Imagotipo para fondos claros. */
    logo: logoSrc,
    /** Imagotipo en negativo (texto claro) para fondos oscuros. */
    logoLight: logoLightSrc,
    /** Isotipo solo: favicon, avatares, espacios reducidos. */
    isotipo: isotipoSrc,
    /** Imagen para compartir en redes (og:image). */
    ogImage: { src: ogImageSrc, width: 1200, height: 630 },
    /** Fondo del hero de la landing (generado con `npm run brand:assets`). */
    landingHero: heroSrc,
    /** Captura del panel que se muestra en la landing: rehacerla después de un rebrand. */
    landingDashboard: landingDashboardSrc,
    loginHero: loginHeroSrc,
  },
} as const;

/** Título de pestaña: "Sección — Marca", o "Marca — tagline" sin sección. */
export function pageTitle(section?: string): string {
  return section ? `${section} — ${brand.name}` : `${brand.name} — ${brand.tagline}`;
}

/** Línea de copyright del año en curso. */
export function copyright(): string {
  return `© ${new Date().getFullYear()} ${brand.name}. Todos los derechos reservados.`;
}

export const mailto = (email: string) => `mailto:${email}`;
