/**
 * Colores de la marca para contextos que no entienden CSS (canvas, jsPDF, etc.).
 *
 * Lee el valor real de una variable CSS del tema en tiempo de ejecución, así el comprobante o el
 * PDF salen siempre con los colores vigentes de `brand.json`, sin repetir hex en el código.
 * En el DOM/SVG no hace falta: usar las clases de Tailwind o `var(--primary)` en estilos inline.
 */

export type Rgb = [number, number, number];

/** Variables del tema disponibles (ver src/styles.css). */
export type ThemeColor =
  | "primary"
  | "primary-50"
  | "primary-100"
  | "primary-600"
  | "primary-700"
  | "secondary"
  | "secondary-50"
  | "secondary-100"
  | "secondary-600"
  | "secondary-700"
  | "highlight"
  | "navigation"
  | "on-primary"
  | "on-secondary"
  | "on-highlight"
  | "danger"
  | "success"
  | "warning"
  | "foreground"
  | "muted-foreground"
  | "border";

/** Variable CSS (definida en styles.css o brand.generated.css) que respalda cada color. */
function cssVar(name: ThemeColor): string {
  const step = /^(primary|secondary)-(\d+)$/.exec(name);
  if (step) return `--brand-${step[1]}-${step[2]}`;
  if (name === "highlight") return "--brand-highlight-500";
  if (
    name === "navigation" ||
    name === "on-primary" ||
    name === "on-secondary" ||
    name === "on-highlight"
  )
    return `--brand-${name}`;
  if (name === "danger") return "--danger-500";
  return `--${name}`;
}

const FALLBACK: Rgb = [0, 0, 0];
const cache = new Map<ThemeColor, Rgb>();

/**
 * Devuelve el color como [r, g, b] (0-255). Funciona con cualquier formato CSS (hex, oklch,
 * color-mix…) porque lo pinta en un canvas de 1px y lee el píxel.
 */
export function resolveColor(name: ThemeColor): Rgb {
  const hit = cache.get(name);
  if (hit) return hit;
  if (typeof document === "undefined") return FALLBACK;

  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar(name)).trim();
  if (!value) return FALLBACK;

  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return FALLBACK;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const rgb: Rgb = [r, g, b];
  cache.set(name, rgb);
  return rgb;
}

/** Mismo color como "#RRGGBB" (para canvas `fillStyle`, jsPDF, etc.). */
export function resolveColorHex(name: ThemeColor): string {
  return (
    "#" +
    resolveColor(name)
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}
