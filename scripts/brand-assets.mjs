#!/usr/bin/env node
/**
 * Genera las imágenes de marca a partir de src/brand/brand.json y del logo en negativo
 * (src/brand/assets/logo-light.svg):
 *
 *   - src/brand/assets/hero.webp       2560×1440  fondo de hero/login (cintas de líneas, manual pág. 37)
 *   - src/brand/assets/og-image.png    1200×630   imagen para compartir en redes (og:image)
 *
 * Uso: node scripts/brand-assets.mjs --subtitle "Texto bajo el logo en la imagen para redes"
 *
 * Son imágenes por defecto, coherentes con la marca. Si diseño entrega fotos o piezas
 * definitivas, reemplazá los archivos manteniendo el nombre (ver BRANDING.md).
 * Requiere `sharp` (si no está instalado: `npm i --no-save sharp`).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "src/brand/assets");
const brand = JSON.parse(readFileSync(resolve(root, "src/brand/brand.json"), "utf8"));
const css = readFileSync(resolve(root, "src/brand/brand.generated.css"), "utf8");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error(
    "brand-assets: falta `sharp`. Instalalo temporalmente con `npm i --no-save sharp`.",
  );
  process.exit(1);
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const subtitle = arg("subtitle", brand.tagline);

const color = (name) => {
  const m = new RegExp(`--brand-${name}: (#[0-9A-Fa-f]{6})`).exec(css);
  if (!m)
    throw new Error(`Falta --brand-${name} en brand.generated.css (corré npm run brand:sync)`);
  return m[1];
};
const BG = color("navigation");
const C1 = color("primary-500");
const C2 = color("secondary-500");
const C3 = color("highlight-500");

/**
 * Cinta de líneas paralelas que se tuercen (manual: "cintas lineales cinéticas formadas por
 * vectores paralelos… con transiciones suaves entre los colores de la marca").
 */
function ribbon({ id, x0, x1, y, amp, twist, lines, spread, freq, phase, width, opacity }) {
  const paths = [];
  const steps = 90;
  for (let i = 0; i < lines; i++) {
    const k = i / (lines - 1) - 0.5;
    let d = "";
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      // La separación entre líneas oscila: la cinta "gira" sobre sí misma.
      const offset = k * spread * Math.cos(t * Math.PI * twist + phase);
      const yy = y + amp * Math.sin(t * Math.PI * freq + phase) + offset;
      d += `${s ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`;
    }
    paths.push(`<path d="${d}" />`);
  }
  // Los extremos de la cinta se desvanecen para que no quede un corte recto.
  return `
  <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
    <stop offset="0" stop-color="${C1}"/><stop offset="0.55" stop-color="${C2}"/><stop offset="1" stop-color="${C3}"/>
  </linearGradient>
  <linearGradient id="${id}-fade" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.18" stop-color="#fff"/>
    <stop offset="0.85" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <mask id="${id}-mask" maskContentUnits="userSpaceOnUse">
    <rect x="${x0}" y="${y - amp - spread}" width="${x1 - x0}" height="${2 * (amp + spread)}" fill="url(#${id}-fade)"/>
  </mask>
  <g fill="none" stroke="url(#${id})" stroke-width="${width}" stroke-opacity="${opacity}" mask="url(#${id}-mask)">${paths.join("")}</g>`;
}

function background(w, h) {
  return `
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <radialGradient id="glow1" cx="0.78" cy="0.28" r="0.55"><stop offset="0" stop-color="${C1}" stop-opacity="0.22"/><stop offset="1" stop-color="${C1}" stop-opacity="0"/></radialGradient>
  <radialGradient id="glow2" cx="0.92" cy="0.95" r="0.5"><stop offset="0" stop-color="${C2}" stop-opacity="0.35"/><stop offset="1" stop-color="${C2}" stop-opacity="0"/></radialGradient>
  <rect width="${w}" height="${h}" fill="url(#glow1)"/>
  <rect width="${w}" height="${h}" fill="url(#glow2)"/>`;
}

// ── Hero / fondo de login ───────────────────────────────────────────────────
{
  const W = 2560;
  const H = 1440;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${background(W, H)}
  ${ribbon({ id: "r1", x0: 900, x1: 2700, y: 560, amp: 230, twist: 2.2, lines: 70, spread: 300, freq: 1.6, phase: 0.4, width: 2, opacity: 0.55 })}
  ${ribbon({ id: "r2", x0: -200, x1: 1300, y: 1240, amp: 120, twist: 1.6, lines: 46, spread: 180, freq: 1.2, phase: 1.9, width: 1.6, opacity: 0.35 })}
</svg>`;
  // Grano sutil: evita los "anillos" (banding) de los degradés al comprimir.
  const noise = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = Math.random() * 255;
    noise[i * 4] = noise[i * 4 + 1] = noise[i * 4 + 2] = v;
    noise[i * 4 + 3] = 10;
  }
  await sharp(Buffer.from(svg))
    .composite([{ input: noise, raw: { width: W, height: H, channels: 4 } }])
    .webp({ quality: 85 })
    .toFile(resolve(assets, "hero.webp"));
  console.log("brand-assets: src/brand/assets/hero.webp");
}

// ── Imagen para redes (og:image) ────────────────────────────────────────────
{
  const W = 1200;
  const H = 630;
  // Logo en negativo, embebido como vector (mismos trazos que logo-light.svg).
  const logo = readFileSync(resolve(assets, "logo-light.svg"), "utf8");
  const [, vx, vy, vw, vh] = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(logo).map(Number);
  const logoPaths = [...logo.matchAll(/<path [^>]+\/>/g)].map((m) => m[0]).join("");
  const logoH = 64;
  const scale = logoH / vh;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  // Corta la descripción en líneas por palabra (máx. 2 líneas).
  const wrap = (text, max) => {
    const lines = [""];
    for (const word of text.split(/\s+/)) {
      const cur = lines[lines.length - 1];
      if ((cur + " " + word).trim().length > max && cur) lines.push(word);
      else lines[lines.length - 1] = (cur + " " + word).trim();
    }
    return lines.length > 2 ? [lines[0], `${lines[1]}…`] : lines;
  };
  const descLines = wrap(brand.description, 52)
    .map((l, i) => `<tspan x="80" dy="${i ? 34 : 0}">${esc(l)}</tspan>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${background(W, H)}
  ${ribbon({ id: "r1", x0: 520, x1: 1320, y: 300, amp: 110, twist: 2.2, lines: 56, spread: 150, freq: 1.6, phase: 0.4, width: 1.4, opacity: 0.6 })}
  <g transform="translate(80 96) scale(${scale}) translate(${-vx} ${-vy})">${logoPaths}</g>
  <text x="80" y="330" fill="#FFFFFF" font-family="Satoshi, Inter, 'Segoe UI', Arial, sans-serif" font-size="54" font-weight="500" letter-spacing="-1">${esc(subtitle)}</text>
  <text x="80" y="384" fill="#FFFFFF" fill-opacity="0.7" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="24">${descLines}</text>
  <rect x="80" y="520" width="56" height="6" rx="3" fill="${C1}"/><rect x="144" y="520" width="28" height="6" rx="3" fill="${C3}"/>
</svg>`;
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(resolve(assets, "og-image.png"));
  console.log("brand-assets: src/brand/assets/og-image.png");
}
