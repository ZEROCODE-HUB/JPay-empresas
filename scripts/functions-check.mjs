#!/usr/bin/env node
/**
 * Comprueba que las Edge Functions desplegadas tengan el acceso que les corresponde:
 *  - las PÚBLICAS de `supabase/config.toml` (verify_jwt = false) responden sin cabecera de
 *    autorización (si Supabase devuelve 401 «Missing authorization header», están mal desplegadas
 *    y no funcionan los avisos de Cobre, el OAuth de cobros con tarjeta ni las tareas de pg_cron);
 *  - el resto exige sesión (401 sin cabecera).
 *
 * No necesita tokens: solo llama a cada función sin autorización y mira el código de respuesta.
 * Uso: npm run functions:check   (opcional SUPABASE_PROJECT_REF; por defecto, el de .env.local)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  console.error("functions-check: define SUPABASE_PROJECT_REF o VITE_SUPABASE_URL en .env.local.");
  process.exit(1);
}

const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const publicas = new Set(
  [...config.matchAll(/^\[functions\.([a-z0-9-]+)\]\s*\r?\nverify_jwt\s*=\s*false/gm)].map(
    (m) => m[1],
  ),
);
const locales = readdirSync(resolve(root, "supabase/functions"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name);

const ref = projectRef();
let errores = 0;
for (const nombre of locales.sort()) {
  // GET sin cabecera de autorización: si la función exige JWT, Supabase corta antes de ejecutarla
  // (401 «Missing authorization header»); si es pública, responde la función (lo que sea).
  const sinCabecera = await fetch(`https://${ref}.supabase.co/functions/v1/${nombre}`).catch(
    () => null,
  );
  const cuerpo = sinCabecera ? await sinCabecera.text().catch(() => "") : "";
  const exigeJwt =
    sinCabecera?.status === 401 && /UNAUTHORIZED_NO_AUTH_HEADER|authorization header/i.test(cuerpo);
  const noExiste = sinCabecera?.status === 404 && /not found|NOT_FOUND/i.test(cuerpo);
  const debeSerPublica = publicas.has(nombre);
  let estado = "ok";
  if (!sinCabecera) estado = "SIN RESPUESTA";
  else if (noExiste) estado = "NO DESPLEGADA";
  else if (debeSerPublica && exigeJwt) estado = "ERROR: debe ser pública y exige JWT";
  else if (!debeSerPublica && !exigeJwt) estado = "ERROR: debería exigir JWT y es pública";
  if (estado !== "ok") errores++;
  console.log(`${nombre.padEnd(30)} ${debeSerPublica ? "pública" : "con JWT"}  ${estado}`);
}
if (errores) {
  console.error(
    `\nfunctions-check: ${errores} función(es) con el acceso mal configurado. Vuelve a desplegarlas:` +
      "\n  npx supabase functions deploy <nombre> --project-ref <ref>   (config.toml decide verify_jwt)",
  );
  process.exit(1);
}
console.log("\nfunctions-check: OK, todas las funciones tienen el acceso correcto.");
