import { CreditCard, FileText, Globe, GraduationCap, Wifi, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Item, Remesa, TxHist } from "./types";

/** Filtros de categoría (incluye "Todos"). */
export const cats = [
  "Todos",
  "Servicios publicos",
  "Telefonia e internet",
  "Impuestos",
  "Tarjetas de credito",
  "Cuotas escolares",
];

/** Categorías reales (sin "Todos"). */
export const CATEGORIAS = cats.filter((c) => c !== "Todos");

export const PREVIEW_LIMIT = 5;

/** Primeros PREVIEW_LIMIT elementos, o todos si `all`. */
export const preview = <T>(items: T[], all: boolean) =>
  all ? items : items.slice(0, PREVIEW_LIMIT);

const ICONO_CATEGORIA: Record<string, LucideIcon> = {
  "Servicios publicos": Zap,
  "Telefonia e internet": Wifi,
  Impuestos: FileText,
  "Tarjetas de credito": CreditCard,
  "Cuotas escolares": GraduationCap,
};

/**
 * Fecha dd/mm/aaaa (datos) o aaaa-mm-dd (input date) → Date local.
 * Si no es una fecha (p. ej. "-") devuelve una fecha inválida (getTime() NaN).
 */
export function parseDate(d: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const [dd, mm, yyyy] = d.split("/").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

/** Días desde hoy hasta la fecha dd/mm/aaaa (negativo si ya pasó). */
export function daysUntil(d: string, hoy: Date = new Date()) {
  const now = new Date(hoy);
  now.setHours(0, 0, 0, 0);
  const t = parseDate(d);
  return Math.ceil((t.getTime() - now.getTime()) / 86400000);
}

/** Texto de vencimiento de un próximo pago; sin fecha válida → "Sin vencimiento". */
export function textoVencimiento(
  venc: string,
  hoy: Date = new Date(),
): { texto: string; vencido: boolean } {
  const dd = daysUntil(venc, hoy);
  if (isNaN(dd)) return { texto: "Sin vencimiento", vencido: false };
  if (dd < 0) return { texto: `Vencido hace ${Math.abs(dd)} dias`, vencido: true };
  return { texto: `Vence en ${dd} dias`, vencido: false };
}

/** Monto "$ 1.234,56" → 1234.56 (punto de miles, coma decimal). NaN si no hay número. */
export const parseMonto = (v: string) => parseFloat(v.replace(/[^0-9,]/g, "").replace(",", "."));
const montoOrden = parseMonto;

/** Timestamp para ordenar por vencimiento: los que no tienen fecha van al final. */
const vencOrden = (venc: string) => {
  const t = parseDate(venc).getTime();
  return isNaN(t) ? Infinity : t;
};
const compararVenc = (a: Item, b: Item) => {
  const ta = vencOrden(a.venc);
  const tb = vencOrden(b.venc);
  return ta === tb ? 0 : ta < tb ? -1 : 1;
};

/** Busca por nombre, número de cliente/cuenta o categoría (sin mayúsculas). */
export function buscarServicios(items: Item[], q: string): Item[] {
  const t = q.trim().toLowerCase();
  if (!t) return items;
  return items.filter((s) => [s.n, s.c, s.cat].some((campo) => campo.toLowerCase().includes(t)));
}

export function ordenarServicios(items: Item[], sort: string): Item[] {
  return [...items].sort((a, b) => {
    if (sort === "vencimiento") return compararVenc(a, b);
    if (sort === "monto") return montoOrden(a.v) - montoOrden(b.v);
    return a.n.localeCompare(b.n);
  });
}

export const ordenarPorVencimiento = (items: Item[]) => [...items].sort(compararVenc);

/** Suma de montos a pagar con decimales ("$ 1.234,56" suma 1234.56). */
export function totalAPagar(items: Item[]) {
  const total = items.reduce((acc, s) => {
    const num = parseMonto(s.v);
    return acc + (isNaN(num) ? 0 : num);
  }, 0);
  return Math.round(total * 100) / 100;
}

/** Filtra el historial. `desde` acepta aaaa-mm-dd (input date) o dd/mm/aaaa. */
export function filtrarHistorial(
  historial: TxHist[],
  f: { cat: string; status: string; desde: string; q?: string },
) {
  const q = (f.q ?? "").trim().toLowerCase();
  return historial.filter((t) => {
    if (q && !t.s.toLowerCase().includes(q) && !t.cat.toLowerCase().includes(q)) return false;
    if (f.cat !== "Todas" && t.cat !== f.cat) return false;
    if (f.status !== "Todos" && t.e !== f.status) return false;
    if (f.desde && parseDate(t.f).getTime() < parseDate(f.desde).getTime()) return false;
    return true;
  });
}

export interface KpisRemesas {
  enviadasMes: number;
  montoMes: number;
  paises: number;
  enProceso: number;
}

/** KPIs de remesas calculados de los datos (fechas dd/mm/aaaa, montos "$ 1.234,56"). */
export function kpisRemesas(remesas: Remesa[], hoy: Date = new Date()): KpisRemesas {
  const delMes = remesas.filter((r) => {
    const d = parseDate(r.f);
    return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
  });
  return {
    enviadasMes: delMes.length,
    montoMes: delMes.reduce((acc, r) => {
      const n = parseMonto(r.mARS);
      return acc + (isNaN(n) ? 0 : n);
    }, 0),
    paises: new Set(remesas.map((r) => r.pais)).size,
    enProceso: remesas.filter((r) => r.e === "En proceso").length,
  };
}

/** Arma el servicio recién suscrito desde el formulario de "Suscribir un servicio". */
export function nuevoServicio(nombre: string, categoria: string, numero: string): Item {
  return {
    n: nombre.trim() || categoria,
    c: "Cliente " + numero.trim(),
    v: "$ 0",
    venc: "-",
    icon: ICONO_CATEGORIA[categoria] ?? Globe,
    cat: categoria,
    e: "Proximo",
    suscrito: true,
  };
}
