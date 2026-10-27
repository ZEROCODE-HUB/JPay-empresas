#!/usr/bin/env node
/**
 * Trae a JPay los commits nuevos del repo original de MoliPay (ver SYNC_MOLIPAY.md).
 *
 * - Lee `.upstream-sync.json` (repo, rama y último commit sincronizado).
 * - Hace cherry-pick -x, en orden, de cada commit posterior que todavía no esté aplicado
 *   (detecta los ya aplicados por el trailer "cherry picked from commit").
 * - Resuelve solo lo mecánico: `bun.lock` (JPay usa npm) se descarta y `package-lock.json`
 *   se regenera. Cualquier otro conflicto se deja para resolver a mano y el script se corta.
 * - Al terminar actualiza `.upstream-sync.json` y corre `brand:check`.
 *
 * Trabaja en una rama `sync/molipay-AAAA-MM-DD`; nunca toca `main` ni hace push.
 *
 * Uso: npm run sync:upstream            (o con --dry-run para solo listar lo pendiente)
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, ".upstream-sync.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const dryRun = process.argv.includes("--dry-run");
const REMOTE = "upstream";

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const gitOk = (...args) => spawnSync("git", args, { cwd: root, stdio: "inherit" }).status === 0;
const npm = (...args) => {
  const r = spawnSync("npm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  return r.status === 0;
};
const fail = (msg) => {
  console.error(`\nsync-upstream: ${msg}`);
  process.exit(1);
};

// 1. Remoto y fetch.
const remotes = git("remote").split("\n");
if (!remotes.includes(REMOTE)) git("remote", "add", REMOTE, config.repo);
git("fetch", "--quiet", REMOTE, config.branch);
const tip = git("rev-parse", `${REMOTE}/${config.branch}`);

// 2. Commits pendientes: posteriores al último sincronizado y no aplicados todavía.
const applied = new Set(
  [...git("log", "--format=%B", "-n", "500").matchAll(/cherry picked from commit ([0-9a-f]{40})/g)].map((m) => m[1]),
);
const pending = git("rev-list", "--reverse", "--no-merges", `${config.lastSynced}..${tip}`)
  .split("\n")
  .filter(Boolean)
  .filter((sha) => !applied.has(sha));

if (pending.length === 0) {
  console.log(`sync-upstream: al día con ${config.repo} (${config.branch} @ ${tip.slice(0, 7)}).`);
  process.exit(0);
}
// Si una corrida anterior se cortó en un conflicto, package.json pudo cambiar en un commit ya aplicado.
const lockfileTouched = git("diff", "--name-only", `${config.lastSynced}..${tip}`)
  .split("\n")
  .some((f) => f === "package.json" || f === "bun.lock");

console.log(`sync-upstream: ${pending.length} commit(s) pendiente(s) de ${config.branch}:`);
for (const sha of pending) console.log(`  ${git("log", "-1", "--format=%h %ad %s", "--date=short", sha)}`);
if (dryRun) process.exit(0);

// 3. Rama de trabajo (nunca sobre main) y árbol limpio.
if (existsSync(resolve(root, ".git/CHERRY_PICK_HEAD"))) {
  fail("hay un cherry-pick a medias. Resolvelo y corré `git cherry-pick --continue`, después volvé a correr este script.");
}
if (git("status", "--porcelain", "--untracked-files=no")) fail("hay cambios sin commitear. Commitealos o descartalos antes.");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch === "main") {
  const name = `sync/molipay-${new Date().toISOString().slice(0, 10)}`;
  git("checkout", "-b", name);
  console.log(`sync-upstream: trabajando en la rama ${name}`);
}

// 4. Cherry-pick uno por uno.
for (const sha of pending) {
  console.log(`\n→ ${git("log", "-1", "--format=%h %s", sha)}`);
  if (gitOk("cherry-pick", "-x", sha)) continue;

  const unmerged = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
  for (const f of unmerged.filter((f) => f === "bun.lock" || f === "package-lock.json")) {
    git("rm", "--cached", "--quiet", "--ignore-unmatch", f);
    if (f === "bun.lock") rmSync(resolve(root, f), { force: true });
    else git("checkout", "HEAD", "--", f);
  }
  const rest = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
  if (rest.length === 0) {
    if (gitOk("-c", "core.editor=true", "cherry-pick", "--continue")) continue;
    if (gitOk("commit", "--quiet", "--no-edit")) continue;
  }
  fail(
    `conflicto en ${rest.join(", ")}.\n` +
      "  Resolvelo siguiendo SYNC_MOLIPAY.md (conservar la marca de JPay, tomar la lógica nueva),\n" +
      "  `git add` los archivos, `git cherry-pick --continue` y volvé a correr `npm run sync:upstream`.",
  );
}

// 5. Dependencias: JPay usa npm, así que el lockfile se regenera acá.
if (lockfileTouched) {
  rmSync(resolve(root, "bun.lock"), { force: true });
  if (!npm("install", "--no-audit", "--no-fund")) fail("npm install falló.");
  if (git("status", "--porcelain", "package-lock.json")) {
    git("add", "package-lock.json");
    git("commit", "--quiet", "-m", "Sync MoliPay: regenerar package-lock.json");
  }
}

saveMarker(tip);

// 6. Marca.
console.log("\nsync-upstream: verificando marca…");
if (!npm("run", "-s", "brand:check")) {
  fail("brand:check encontró restos de la marca anterior. Corregilos (ver SYNC_MOLIPAY.md) y commiteá.");
}
console.log("\nsync-upstream: listo. Revisá tipos (npx tsc --noEmit) y build (npx vite build) antes de mergear a main.");

function saveMarker(sha) {
  config.lastSynced = sha;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  git("add", ".upstream-sync.json");
  if (git("diff", "--cached", "--name-only")) git("commit", "--quiet", "-m", `Sync MoliPay: al día hasta ${sha.slice(0, 7)}`);
}
