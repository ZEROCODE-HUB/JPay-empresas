#!/usr/bin/env node
/**
 * Regenera `src/lib/database.types.ts` desde el esquema real de Supabase.
 *
 * Usa la Management API (no requiere el CLI de Supabase). Necesita un token personal
 * con acceso al proyecto: https://supabase.com/dashboard/account/tokens
 *
 * Uso: SUPABASE_ACCESS_TOKEN=sbp_... npm run gen:types
 *      (opcional SUPABASE_PROJECT_REF; por defecto se toma de VITE_SUPABASE_URL en .env.local)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "src/lib/database.types.ts");

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("gen-types: falta SUPABASE_ACCESS_TOKEN (token personal de Supabase).");
  process.exit(1);
}

function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  for (const file of [".env.local", ".env"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const m = readFileSync(path, "utf8").match(
      /^VITE_SUPABASE_URL\s*=\s*"?https:\/\/([a-z0-9]+)\.supabase\.co/m,
    );
    if (m) return m[1];
  }
  console.error(
    "gen-types: no se encontró el proyecto. Definí SUPABASE_PROJECT_REF o VITE_SUPABASE_URL en .env.local.",
  );
  process.exit(1);
}

const ref = projectRef();
const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
  { headers: { Authorization: `Bearer ${token}` } },
);
if (!res.ok) {
  console.error(`gen-types: la API respondió ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const { types } = await res.json();
writeFileSync(out, types);
console.log(`gen-types: ${out} actualizado desde el proyecto ${ref}.`);
