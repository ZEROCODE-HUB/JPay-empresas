/**
 * Comprobante en PNG para compartir. Se dibuja con Canvas para que WhatsApp y
 * el correo reciban una imagen simple, legible y con formato bancario.
 */
import {
  formatearMonto,
  formatearFechaComprobante,
  nombreArchivoComprobante,
  type DatosComprobante,
} from "./comprobante";

const ANCHO = 900;
const PAD = 42;
const TEXTO = "#222222";
const GRIS = "#6b7280";
const BORDE = "#e5e7eb";
const AZUL = "#0077ff";
const FUENTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, Menlo, Consolas, 'Courier New', monospace";

type Bloque =
  | { t: "encabezado"; titulo: string; fecha: string }
  | { t: "monto"; texto: string }
  | { t: "seccion"; texto: string }
  | { t: "fila"; label: string; valor: string; mono?: boolean }
  | { t: "linea" }
  | { t: "espacio"; h: number }
  | { t: "pie"; texto: string };

const ALTO: Record<Bloque["t"], number> = {
  encabezado: 46, monto: 44, seccion: 29, fila: 26, linea: 1, espacio: 0, pie: 30,
};

function soloDigitos(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

function bloques(d: DatosComprobante): Bloque[] {
  return [
    { t: "encabezado", titulo: "Enviaste dinero", fecha: formatearFechaComprobante(d.fecha) },
    { t: "espacio", h: 12 },
    { t: "monto", texto: formatearMonto(d.monto) },
    { t: "espacio", h: 12 }, { t: "linea" }, { t: "espacio", h: 20 },
    { t: "seccion", texto: "Desde:" },
    { t: "fila", label: "Nombre:", valor: d.desde.nombre || "—" },
    { t: "fila", label: "CUIT:", valor: soloDigitos(d.desde.cuit) || "—", mono: true },
    { t: "fila", label: "CBU/CVU:", valor: d.desde.cbu || "—", mono: true },
    { t: "espacio", h: 20 }, { t: "linea" }, { t: "espacio", h: 20 },
    { t: "seccion", texto: "Hacia:" },
    { t: "fila", label: "Nombre:", valor: d.hacia.nombre || "—" },
    { t: "fila", label: "CUIT:", valor: soloDigitos(d.hacia.cuit) || "—", mono: true },
    { t: "fila", label: "CBU/CVU:", valor: d.hacia.cbu || "—", mono: true },
    ...(d.hacia.banco ? [{ t: "fila" as const, label: "Banco:", valor: d.hacia.banco }] : []),
    { t: "espacio", h: 20 }, { t: "linea" }, { t: "espacio", h: 18 },
    { t: "fila", label: "Estado:", valor: d.estado || "—" },
    { t: "fila", label: "ID de transacción:", valor: d.txid, mono: true },
    { t: "espacio", h: 26 }, { t: "pie", texto: "Comprobante no válido como factura" },
  ];
}

function recortar(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number): string {
  if (ctx.measureText(texto).width <= maxAncho) return texto;
  let corte = texto;
  while (corte.length > 1 && ctx.measureText(corte + "…").width > maxAncho) corte = corte.slice(0, -1);
  return corte + "…";
}

function dibujar(d: DatosComprobante): HTMLCanvasElement {
  const lista = bloques(d);
  const alto = PAD + lista.reduce((s, x) => s + (x.t === "espacio" ? x.h : ALTO[x.t]), 0) + PAD;
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = ANCHO * dpr;
  canvas.height = alto * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo generar la imagen del comprobante");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ANCHO, alto);

  let y = PAD;
  for (const x of lista) {
    switch (x.t) {
      case "encabezado":
        ctx.fillStyle = TEXTO;
        ctx.font = "700 17px " + FUENTE;
        ctx.textAlign = "left";
        ctx.fillText(x.titulo, PAD, y + 16);
        ctx.font = "400 13px " + FUENTE;
        ctx.textAlign = "right";
        ctx.fillText(x.fecha, ANCHO - PAD, y + 16);
        ctx.textAlign = "left";
        y += ALTO.encabezado;
        break;
      case "monto":
        ctx.fillStyle = TEXTO;
        ctx.font = "700 16px " + FUENTE;
        ctx.fillText("Monto de operación:", PAD, y + 18);
        ctx.fillStyle = AZUL;
        ctx.textAlign = "right";
        ctx.fillText(x.texto, ANCHO - PAD, y + 18);
        ctx.textAlign = "left";
        y += ALTO.monto;
        break;
      case "seccion":
        ctx.fillStyle = TEXTO;
        ctx.font = "400 16px " + FUENTE;
        ctx.fillText(x.texto, PAD, y + 18);
        y += ALTO.seccion;
        break;
      case "fila":
        ctx.fillStyle = TEXTO;
        ctx.font = "700 15px " + FUENTE;
        ctx.fillText(x.label, PAD, y + 19);
        ctx.font = x.mono ? "600 15px " + MONO : "500 15px " + FUENTE;
        ctx.textAlign = "right";
        ctx.fillText(recortar(ctx, x.valor, ANCHO - PAD * 2 - 190), ANCHO - PAD, y + 19);
        ctx.textAlign = "left";
        y += ALTO.fila;
        break;
      case "linea":
        ctx.strokeStyle = BORDE;
        ctx.beginPath();
        ctx.moveTo(PAD, y + 0.5);
        ctx.lineTo(ANCHO - PAD, y + 0.5);
        ctx.stroke();
        y += ALTO.linea;
        break;
      case "espacio":
        y += x.h;
        break;
      case "pie":
        ctx.fillStyle = GRIS;
        ctx.font = "400 13px " + FUENTE;
        ctx.textAlign = "center";
        ctx.fillText(x.texto, ANCHO / 2, y + 16);
        ctx.textAlign = "left";
        y += ALTO.pie;
        break;
    }
  }
  return canvas;
}

export function generarComprobantePng(d: DatosComprobante): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      dibujar(d).toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), "image/png");
    } catch (e) {
      reject(e as Error);
    }
  });
}

export async function descargarComprobantePng(d: DatosComprobante): Promise<void> {
  const blob = await generarComprobantePng(d);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoComprobante(d, "png");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ResultadoCompartir = "compartido" | "descargado" | "cancelado" | "error";

export async function compartirComprobante(d: DatosComprobante): Promise<ResultadoCompartir> {
  let archivo: File;
  try {
    archivo = new File([await generarComprobantePng(d)], nombreArchivoComprobante(d, "png"), { type: "image/png" });
  } catch {
    return "error";
  }
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (typeof nav.share === "function" && (typeof nav.canShare !== "function" || nav.canShare({ files: [archivo] }))) {
    try {
      await nav.share({ files: [archivo], title: "Comprobante de transferencia", text: "Comprobante de la transferencia " + d.txid });
      return "compartido";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelado";
    }
  }
  try {
    await descargarComprobantePng(d);
    return "descargado";
  } catch {
    return "error";
  }
}