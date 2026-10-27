import type {
  LoteEstado,
  LoteGestionRow,
  MedioPago,
  RegistroDeLote,
} from "@/lib/api/cobros-masivos";
import { buildResolvableUrl, toResolvableLinkPagoUrl } from "@/lib/pay-url";

/** Porcentaje entero de `parte` sobre `total` (0 si el total es 0). */
export const porcentaje = (parte: number, total: number): number =>
  total > 0 ? Math.round((parte / total) * 100) : 0;

/** Rango "1–10 de 35" que muestran las paginaciones de cobros. */
export const rangoPagina = (page: number, pageSize: number, total: number): string =>
  `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`;

export const totalPaginas = (total: number, pageSize: number): number =>
  Math.max(1, Math.ceil(total / pageSize));

export const paginar = <T>(rows: T[], page: number, pageSize: number): T[] =>
  rows.slice((page - 1) * pageSize, page * pageSize);

// ===== Resumen de registros de un lote =====

export interface ResumenRegistros {
  totalRegistros: number;
  cobrados: number;
  parciales: number;
  pendientes: number;
  vencidos: number;
  conError: number;
  montoTotal: number;
  montoCobrado: number;
  pctCobrado: number;
}

export function resumenRegistros(registros: RegistroDeLote[]): ResumenRegistros {
  const contar = (estado: RegistroDeLote["estado"]) =>
    registros.filter((r) => r.estado === estado).length;
  const montoTotal = registros.reduce((s, r) => s + r.monto, 0);
  const montoCobrado = registros.reduce((s, r) => s + r.montoPagado, 0);
  return {
    totalRegistros: registros.length,
    cobrados: contar("pagado_total"),
    parciales: contar("pagado_parcial"),
    pendientes: contar("pendiente"),
    vencidos: contar("vencido"),
    conError: contar("error"),
    montoTotal,
    montoCobrado,
    pctCobrado: porcentaje(montoCobrado, montoTotal),
  };
}

/** URL resoluble para copiar: rearma la URL a partir del código final del link guardado. */
export function linkParaCopiar(url: string): string {
  const code = url.split("/").pop();
  return code ? buildResolvableUrl(code) : toResolvableLinkPagoUrl(url);
}

// ===== Filtro de gestión de lotes =====

export interface FiltrosLotes {
  busqueda: string;
  estado: LoteEstado | "todos";
  desde: string;
  hasta: string;
}

export function filtrarLotes(lotes: LoteGestionRow[], f: FiltrosLotes): LoteGestionRow[] {
  let data = lotes;
  if (f.busqueda) {
    const q = f.busqueda.toLowerCase();
    data = data.filter(
      (l) =>
        l.nombre.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q) ||
        l.periodo.includes(q),
    );
  }
  if (f.estado !== "todos") data = data.filter((l) => l.estado === f.estado);
  if (f.desde) data = data.filter((l) => l.createdAt.slice(0, 10) >= f.desde);
  if (f.hasta) data = data.filter((l) => l.createdAt.slice(0, 10) <= f.hasta);
  return data;
}

// ===== Parámetros generales de un lote nuevo =====

export interface ParametrosLote {
  nombre: string;
  periodo: string;
  diaProcesamiento: number;
  tasaInteres: number;
  fechaVenc1: string;
  fechaVenc2: string;
  fechaVenc3: string;
  mediosPago: MedioPago[];
  pagosParciales: boolean;
  notificaciones: boolean;
}

/** Valida el paso 1 del alta de lote. Devuelve el mensaje de error o `null` si es válido. */
export function validarParametros(p: ParametrosLote, manana: string): string | null {
  if (!p.nombre.trim()) return "El nombre del lote es obligatorio";
  if (!p.periodo) return "Selecciona el periodo";
  if (!p.diaProcesamiento || p.diaProcesamiento < 1 || p.diaProcesamiento > 31)
    return "El dia de pago debe ser un numero entre 1 y 31";
  if (!p.fechaVenc1 || p.fechaVenc1 < manana)
    return "La primera fecha de vencimiento no puede ser anterior a manana";
  if (p.fechaVenc2 && p.fechaVenc2 <= p.fechaVenc1)
    return "El 2º vencimiento debe ser posterior al 1º";
  if (p.fechaVenc3 && !p.fechaVenc2)
    return "Para cargar el 3º vencimiento primero carga el 2º vencimiento";
  if (p.fechaVenc3 && p.fechaVenc3 <= p.fechaVenc2)
    return "El 3º vencimiento debe ser posterior al 2º";
  if (p.mediosPago.length === 0) return "Selecciona al menos un medio de pago";
  return null;
}

// ===== Rango personalizado del dashboard =====

const partesFecha = (ymd: string): [number, number, number] => {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m - 1, d];
};

/** Inicio del día local (00:00:00.000) de una fecha `yyyy-MM-dd` de un input date. */
export const inicioDiaLocal = (ymd: string): Date => new Date(...partesFecha(ymd), 0, 0, 0, 0);

/** Fin del día local (23:59:59.999) de una fecha `yyyy-MM-dd`: el "Hasta" incluye todo el día. */
export const finDiaLocal = (ymd: string): Date => new Date(...partesFecha(ymd), 23, 59, 59, 999);
