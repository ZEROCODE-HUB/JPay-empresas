#!/usr/bin/env node
/**
 * Verifica que el código compartido sea idéntico en JPay-admin y JPay-empresas.
 *
 * Los dos repos son independientes pero comparten utilidades y componentes genéricos.
 * Lo compartido vive en las rutas de SHARED; cualquier cambio se hace en un repo y se copia
 * al otro con `npm run shared:check -- --fix` (copia desde este repo al hermano).
 *
 * El repo hermano se busca en ../JPay-empresas o ../JPay-admin (o SHARED_SIBLING=<ruta>).
 * Si no está (por ejemplo en CI), avisa y no falla.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHARED = [
  "src/shared",
  "ARCHITECTURE.md",
  "src/brand/brand.json",
  "src/brand/colors.ts",
  "scripts/brand-assets.mjs",
  "scripts/brand-check.mjs",
  "scripts/brand-sync.mjs",
  "scripts/gen-types.mjs",
  "scripts/shared-check.mjs",
  "scripts/sync-upstream.mjs",
  "SYNC_MOLIPAY.md",
  "supabase/functions/_shared/ecartpay.test.ts",
  "supabase/functions/_shared/ecartpay.ts",
  "supabase/functions/_shared/http.ts",
  "vitest.config.ts",
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fix = process.argv.includes("--fix");
const sibling =
  process.env.SHARED_SIBLING ??
  ["JPay-empresas", "JPay-admin"]
    .filter((n) => n !== basename(root))
    .map((n) => resolve(root, "..", n))
    .find(existsSync);

if (!sibling || !existsSync(sibling)) {
  console.warn("shared-check: no se encontró el repo hermano; no se verifica nada.");
  process.exit(0);
}

const listar = (base, p) => {
  const abs = join(base, p);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [p];
  return readdirSync(abs).flatMap((f) => listar(base, `${p}/${f}`));
};
// Comparar sin importar CRLF/LF (Windows con autocrlf).
const leer = (f) => (existsSync(f) ? readFileSync(f, "utf8").replace(/\r\n/g, "\n") : null);

const archivos = [...new Set(SHARED.flatMap((p) => [...listar(root, p), ...listar(sibling, p)]))];
const distintos = archivos.filter((f) => leer(join(root, f)) !== leer(join(sibling, f)));

if (distintos.length === 0) {
  console.log(`shared-check: OK, ${archivos.length} archivos compartidos idénticos.`);
  process.exit(0);
}

if (fix) {
  for (const f of distintos) {
    const origen = join(root, f);
    if (!existsSync(origen)) {
      console.warn(`  ${f}: no existe en este repo; borralo a mano en el hermano si corresponde.`);
      continue;
    }
    mkdirSync(dirname(join(sibling, f)), { recursive: true });
    copyFileSync(origen, join(sibling, f));
    console.log(`  copiado → ${relative(resolve(root, ".."), join(sibling, f))}`);
  }
  process.exit(0);
}

console.error(
  `shared-check: ${distintos.length} archivo(s) compartido(s) difieren con ${sibling}:`,
);
for (const f of distintos) console.error(`  ${f}`);
console.error("Unificalos y copiá la versión buena con `npm run shared:check -- --fix`.");
process.exit(1);
