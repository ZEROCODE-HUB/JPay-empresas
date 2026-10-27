#!/usr/bin/env node
/**
 * Muestra qué hay de nuevo en el repo original de MoliPay para portarlo a mano (ver SYNC_MOLIPAY.md).
 *
 * Desde el refactor de 2026-10 JPay tiene otra estructura (features/, lib/api, shared/), así que
 * los commits de MoliPay ya no se pueden aplicar con cherry-pick: se revisan y se portan por
 * funcionalidad. Este script nunca modifica el código.
 *
 *   npm run sync:upstream                 lista los commits nuevos y los archivos que tocan
 *   npm run sync:upstream -- --diff <sha> muestra el diff de un commit de MoliPay
 *   npm run sync:upstream -- --mark <sha> registra que se portó todo hasta <sha> (.upstream-sync.json)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, ".upstream-sync.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const REMOTE = "upstream";

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

if (!git("remote").split("\n").includes(REMOTE)) git("remote", "add", REMOTE, config.repo);
git("fetch", "--quiet", REMOTE, config.branch);
const tip = git("rev-parse", `${REMOTE}/${config.branch}`);

const diffSha = arg("--diff");
if (diffSha) {
  process.stdout.write(git("show", "--stat", "--patch", diffSha) + "\n");
  process.exit(0);
}

const markSha = arg("--mark");
if (markSha) {
  config.lastSynced = git("rev-parse", markSha);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`sync-upstream: registrado como portado hasta ${config.lastSynced.slice(0, 7)}.`);
  console.log("Commiteá .upstream-sync.json junto con el código portado.");
  process.exit(0);
}

const pending = git("rev-list", "--reverse", "--no-merges", `${config.lastSynced}..${tip}`)
  .split("\n")
  .filter(Boolean);

if (pending.length === 0) {
  console.log(
    `sync-upstream: nada nuevo en ${config.repo} (${config.branch} @ ${tip.slice(0, 7)}).`,
  );
  process.exit(0);
}

console.log(
  `sync-upstream: ${pending.length} commit(s) nuevo(s) en ${config.branch} para revisar:\n`,
);
for (const sha of pending) {
  console.log(git("log", "-1", "--format=%h  %ad  %s", "--date=short", sha));
  const files = git("diff-tree", "--no-commit-id", "--name-status", "-r", sha).split("\n");
  for (const f of files.filter(Boolean)) console.log(`      ${f}`);
}
console.log(
  "\nPara cada funcionalidad: revisá el diff (--diff <sha>), portala a la estructura de JPay" +
    "\n(features/, lib/api, shared/) y al terminar registrá el avance con --mark <sha>.",
);
