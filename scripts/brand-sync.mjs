#!/usr/bin/env node
/**
 * Genera los archivos derivados de la marca a partir de `src/brand/brand.json`:
 *
 *   - src/brand/brand.generated.css         → variables CSS --brand-* (las consume src/styles.css)
 *   - supabase/functions/_shared/brand.ts   → copia de la marca para las Edge Functions (Deno no
 *                                             puede importar archivos fuera de supabase/functions)
 *
 * Uso:
 *   node scripts/brand-sync.mjs           escribe los archivos
 *   node scripts/brand-sync.mjs --check   falla (exit 1) si los archivos no están al día
 *
 * Si en `brand.json` una escala de color solo trae algunos pasos (por ejemplo solo "500"), los
 * pasos faltantes se derivan mezclando el color base con blanco/negro en espacio OKLab.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brandPath = resolve(root, "src/brand/brand.json");
const cssPath = resolve(root, "src/brand/brand.generated.css");
const functionsDir = resolve(root, "supabase/functions");
const sharedPath = resolve(functionsDir, "_shared/brand.ts");

const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
/** Cuánto blanco (pasos claros) o negro (pasos oscuros) se mezcla con el color base. */
const MIX = {
  50: ["white", 0.92],
  100: ["white", 0.8],
  200: ["white", 0.62],
  300: ["white", 0.42],
  400: ["white", 0.2],
  600: ["black", 0.12],
  700: ["black", 0.25],
  800: ["black", 0.36],
  900: ["black", 0.46],
};
const PALETTES = ["primary", "secondary", "highlight"];
const HEADER =
  "ARCHIVO GENERADO por scripts/brand-sync.mjs desde src/brand/brand.json. No editar a mano.";

// ── Color helpers (sRGB <-> OKLab) ──────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Color inválido "${hex}": usá formato #RRGGBB`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
}

function rgbToHex(rgb) {
  return (
    "#" +
    rgb
      .map((c) =>
        Math.round(Math.min(1, Math.max(0, c)) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGamma);
}

function mix(hex, target, amount) {
  const from = rgbToOklab(hexToRgb(hex));
  const to = rgbToOklab(target === "white" ? [1, 1, 1] : [0, 0, 0]);
  return rgbToHex(oklabToRgb(from.map((v, i) => v + (to[i] - v) * amount)));
}

function completeScale(name, scale) {
  if (!scale || !scale["500"]) throw new Error(`colors.${name} necesita al menos el paso "500"`);
  const out = {};
  for (const step of STEPS) {
    if (scale[step]) out[step] = rgbToHex(hexToRgb(scale[step]));
    else {
      const [target, amount] = MIX[step];
      out[step] = mix(scale["500"], target, amount);
    }
  }
  return out;
}

// ── Build outputs ───────────────────────────────────────────────────────────

function stripComments(value) {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !k.startsWith("$"))
        .map(([k, v]) => [k, stripComments(v)]),
    );
  }
  return value;
}

const brand = stripComments(JSON.parse(readFileSync(brandPath, "utf8")));
const hex = (value, fallback) => rgbToHex(hexToRgb(value ?? fallback));
const colors = {
  ...brand.colors,
  ...Object.fromEntries(PALETTES.map((p) => [p, completeScale(p, brand.colors[p])])),
  // Opcional: tinte de los grises de la UI (textos, bordes). Sin él, la app usa grises neutros.
  neutral: brand.colors.neutral ? completeScale("neutral", brand.colors.neutral) : null,
  navigation: brand.colors.navigation ? hex(brand.colors.navigation) : null,
  // Opcional: fondo de las pantallas. Sin él, cada app usa su fondo neutro.
  surface: brand.colors.surface ? hex(brand.colors.surface) : null,
  onPrimary: hex(brand.colors.onPrimary, "#FFFFFF"),
  onSecondary: hex(brand.colors.onSecondary, "#FFFFFF"),
  onHighlight: hex(brand.colors.onHighlight, "#FFFFFF"),
};
colors.navigation ??= colors.secondary["800"];
// Color principal para TEXTO sobre fondos claros: un paso de la escala ("700") o un hex.
// Si el principal no contrasta sobre blanco (p. ej. un verde claro), apuntar a un paso oscuro.
const ink = brand.colors.primaryInk ?? "500";
colors.primaryInk = /^#/.test(ink) ? hex(ink) : colors.primary[ink];
if (!colors.primaryInk)
  throw new Error(`colors.primaryInk "${ink}" no es un paso de la escala primary`);

/** "Satoshi" → `"Satoshi", system-ui, sans-serif` (comillas para nombres con espacios). */
const fontStack = (family, fallback) => `"${family}", ${fallback}`;
const fonts = brand.fonts ?? {};

const cssLines = [`/* ${HEADER} */`, "", ":root {"];
for (const p of [...PALETTES, ...(colors.neutral ? ["neutral"] : [])]) {
  for (const step of STEPS) cssLines.push(`  --brand-${p}-${step}: ${colors[p][step]};`);
  cssLines.push("");
}
cssLines.push(`  --brand-navigation: ${colors.navigation};`);
cssLines.push(`  --brand-primary-ink: ${colors.primaryInk};`);
if (colors.surface) cssLines.push(`  --brand-surface: ${colors.surface};`);
cssLines.push(`  --brand-on-primary: ${colors.onPrimary};`);
cssLines.push(`  --brand-on-secondary: ${colors.onSecondary};`);
cssLines.push(`  --brand-on-highlight: ${colors.onHighlight};`);
if (fonts.body)
  cssLines.push("", `  --brand-font-body: ${fontStack(fonts.body, "system-ui, sans-serif")};`);
if (fonts.display)
  cssLines.push(`  --brand-font-display: ${fontStack(fonts.display, "system-ui, sans-serif")};`);
if (fonts.displayWeight) cssLines.push(`  --brand-font-display-weight: ${fonts.displayWeight};`);
cssLines.push("}", "");
const css = cssLines.join("\n");

const shared =
  `// ${HEADER}\n` +
  "// Copia de la marca para las Edge Functions (correos, etc.).\n\n" +
  `export const brand = ${JSON.stringify({ ...brand, colors }, null, 2)} as const;\n`;

const outputs = [[cssPath, css]];
if (existsSync(functionsDir)) outputs.push([sharedPath, shared]);

// ── Write or check ──────────────────────────────────────────────────────────

const check = process.argv.includes("--check");
const stale = [];
for (const [path, content] of outputs) {
  const current = existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : null;
  if (current === content) continue;
  if (check) stale.push(path);
  else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`brand-sync: actualizado ${path.slice(root.length + 1)}`);
  }
}

if (stale.length) {
  console.error("brand-sync: archivos desactualizados respecto de src/brand/brand.json:");
  for (const p of stale) console.error(`  - ${p.slice(root.length + 1)}`);
  console.error("Corré `npm run brand:sync` y commiteá el resultado.");
  process.exit(1);
}
