import type { PuntoVenta } from "@/lib/api/qr";

export type FiltrosPdv = {
  search: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string;
};

export const FILTROS_VACIOS: FiltrosPdv = {
  search: "",
  estado: "Todos",
  fechaInicio: "",
  fechaFin: "",
};

/** Filtra por nombre (sin mayúsculas), estado y rango de fecha de creación (YYYY-MM-DD). */
export function filtrarPdvs(pdvs: PuntoVenta[], f: FiltrosPdv): PuntoVenta[] {
  let list = [...pdvs];
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter((p) => p.nombre.toLowerCase().includes(q));
  }
  if (f.estado !== "Todos") {
    list = list.filter((p) => p.estado === f.estado);
  }
  if (f.fechaInicio) {
    list = list.filter((p) => (p.created_at ?? "").slice(0, 10) >= f.fechaInicio);
  }
  if (f.fechaFin) {
    list = list.filter((p) => (p.created_at ?? "").slice(0, 10) <= f.fechaFin);
  }
  return list;
}

export const hayFiltros = (f: FiltrosPdv): boolean =>
  Boolean(f.search || f.estado !== "Todos" || f.fechaInicio || f.fechaFin);

/** Texto de la barra superior: "Total: N puntos de venta" o "X de N puntos". */
export function resumenTotal(filtrados: number, total: number): string {
  const s = total !== 1 ? "s" : "";
  return filtrados === total
    ? `Total: ${total} punto${s} de venta`
    : `${filtrados} de ${total} punto${s}`;
}

/** Texto "desde–hasta de total" de la paginación. */
export function rangoPagina(page: number, pageSize: number, total: number): string {
  if (total === 0) return "0 registros";
  return `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`;
}
