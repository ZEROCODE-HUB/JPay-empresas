import { CreditCard, FileText, Globe, GraduationCap, Wifi, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Item, TxHist } from "./types";

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

/** Fecha dd/mm/aaaa → Date local. */
export function parseDate(d: string) {
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

/** Monto para ordenar: "$ 1.234,56" → 1234.56. */
const montoOrden = (v: string) => parseFloat(v.replace(/[^0-9,]/g, "").replace(",", "."));

export function ordenarServicios(items: Item[], sort: string): Item[] {
  return [...items].sort((a, b) => {
    if (sort === "vencimiento") return parseDate(a.venc).getTime() - parseDate(b.venc).getTime();
    if (sort === "monto") return montoOrden(a.v) - montoOrden(b.v);
    return a.n.localeCompare(b.n);
  });
}

export const ordenarPorVencimiento = (items: Item[]) =>
  [...items].sort((a, b) => parseDate(a.venc).getTime() - parseDate(b.venc).getTime());

/**
 * Suma de montos a pagar. Ojo: quita todo lo que no es dígito (incluida la coma
 * decimal), así que "$ 1.234,56" suma 123456. Se conserva tal cual estaba.
 */
export function totalAPagar(items: Item[]) {
  return items.reduce((acc, s) => {
    const num = parseFloat(s.v.replace(/[^0-9]/g, "").replace(",", "."));
    return acc + (isNaN(num) ? 0 : num);
  }, 0);
}

export function filtrarHistorial(
  historial: TxHist[],
  f: { cat: string; status: string; desde: string },
) {
  return historial.filter((t) => {
    if (f.cat !== "Todas" && t.cat !== f.cat) return false;
    if (f.status !== "Todos" && t.e !== f.status) return false;
    if (f.desde && parseDate(t.f).getTime() < parseDate(f.desde).getTime()) return false;
    return true;
  });
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
