#!/usr/bin/env node
/**
 * Verifica que la marca no esté escrita a mano en el código. Falla (exit 1) si encuentra, fuera
 * de src/brand/ y de los archivos generados:
 *
 *   1. El nombre de la marca (actual o anteriores), de la empresa o sus dominios (de brand.json).
 *   2. Un color hex que coincida con un color de la marca (de src/brand/brand.generated.css).
 *   3. Clases de color sin semántica que mezclan marca y error: red-*, navy-*.
 *      Usar primary-* / secondary-* / highlight-* (marca) o danger-* / destructive (errores).
 *   4. `text-white` sobre un fondo sólido de marca: usar text-primary-foreground /
 *      text-highlight-foreground (el contraste depende de la marca).
 *   5. `text-primary` como color de texto: usar text-primary-ink (contraste sobre fondo claro).
 *
 * Para excepciones legítimas (claves de storage, prefijos de IDs ya persistidos, etc.) agregar
 * el comentario `brand-check-ignore` en la misma línea, explicando el motivo.
 *
 * Uso: node scripts/brand-check.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brand = JSON.parse(readFileSync(resolve(root, "src/brand/brand.json"), "utf8"));
const generatedCss = readFileSync(resolve(root, "src/brand/brand.generated.css"), "utf8");

const SCAN_DIRS = ["src", "supabase/functions"];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP = ["src/brand/", "src/routeTree.gen.ts", "supabase/functions/_shared/brand.ts"].map(
  (p) => p.split("/").join(sep),
);
const IGNORE_MARK = "brand-check-ignore";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 1. Términos de marca: nombres y dominios.
const hosts = new Set();
for (const value of [...Object.values(brand.contact), ...Object.values(brand.web)]) {
  const host = String(value)
    .replace(/^mailto:/, "")
    .replace(/^https?:\/\//, "")
    .split("@")
    .pop();
  hosts.add(host.split("/")[0]);
}
// Incluye los nombres anteriores de la marca (`previousNames`) para que no quede ninguno suelto.
const nameTerms = [
  brand.name,
  brand.shortName,
  brand.company.shortName,
  brand.company.legalName,
  ...(brand.previousNames ?? []),
]
  .filter(Boolean)
  .map((t) => escape(t));
const brandText = new RegExp(`(?<![\\w-])(?:${nameTerms.join("|")})(?![\\w])`, "i");
const brandHosts = new RegExp([...hosts].map(escape).join("|"), "i");

// 2. Colores de marca (cualquier paso de las escalas).
// Blanco y negro (p. ej. texto sobre el color de marca) no cuentan: son neutros.
const brandHex = new Set(
  [...generatedCss.matchAll(/#[0-9a-f]{6}\b/gi)]
    .map((m) => m[0].toUpperCase())
    .filter((hex) => hex !== "#FFFFFF" && hex !== "#000000"),
);
const hexLiteral = /#[0-9a-fA-F]{6}\b/g;

// 3. Clases/variables de color sin semántica.
const rawColor =
  /\b(?:[a-z-]+:)*(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|outline|divide|shadow|decoration|accent|caret|placeholder)-(?:red|navy)-\d{2,3}\b|var\(--(?:red|navy)-[a-z0-9-]+\)/;

// 4. Texto blanco fijo sobre un fondo de marca: el color de texto correcto depende de la marca
//    (p. ej. sobre un primario claro va texto oscuro). Usar text-primary-foreground /
//    text-highlight-foreground.
const solidBrandBg =
  /(?<![\w-])(?:[a-z-]+:)*bg-(primary|highlight)(?:-(?:300|400|500|600|700|800|900))?(?![\w/-])/;
const whiteText = /(?<![\w-])text-white(?![\w/-])/;
// 5. Texto en el color principal: usar text-primary-ink (tono con contraste sobre fondo claro).
//    Sobre fondos oscuros usar un paso claro explícito (p. ej. text-primary-300/400).
const primaryText = /(?<![\w-])(?:[a-z-]+:)*text-primary(?:-(?:500|600))?(?![\w-])/;

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTENSIONS.test(entry)) yield full;
  }
}

const problems = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(resolve(root, dir))) {
    const rel = relative(root, file);
    if (SKIP.some((s) => rel === s || rel.startsWith(s))) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.includes(IGNORE_MARK)) return;
      const where = `${rel.split(sep).join("/")}:${i + 1}`;
      const text = line.match(brandText);
      if (text)
        problems.push(
          `${where}  marca escrita a mano "${text[0]}" → usar brand.* de @/brand/brand`,
        );
      const host = line.match(brandHosts);
      if (host)
        problems.push(`${where}  dominio de marca "${host[0]}" → usar brand.contact / brand.web`);
      for (const m of line.matchAll(hexLiteral)) {
        if (brandHex.has(m[0].toUpperCase()))
          problems.push(
            `${where}  color de marca ${m[0]} → usar clases primary/secondary/highlight o resolveColor()`,
          );
      }
      const raw = line.match(rawColor);
      if (raw)
        problems.push(
          `${where}  color sin semántica "${raw[0]}" → usar primary-*/secondary-*/highlight-* o danger-*`,
        );
      const bg = line.match(solidBrandBg);
      if (bg && whiteText.test(line))
        problems.push(`${where}  "text-white" sobre bg-${bg[1]} → usar text-${bg[1]}-foreground`);
      const pt = line.match(primaryText);
      if (pt) problems.push(`${where}  "${pt[0]}" como color de texto → usar text-primary-ink`);
    });
  }
}

if (problems.length) {
  console.error(`brand-check: ${problems.length} problema(s):`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("brand-check: OK, la marca solo vive en src/brand/.");
