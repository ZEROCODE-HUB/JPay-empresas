import type { DiaAcreditacion, LoteAcredDetalle, Ticket } from "@/lib/api/liquidaciones";
import type {
  AdelantoParaCalendario,
  CalendarioAcreditacion,
} from "@/lib/api/calendario-acreditaciones";

// ============================================================================
// Fechas
// ============================================================================

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** "YYYY-MM-DD" → Date en hora local (sin corrimiento por zona horaria). */
export function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Etiqueta corta de la celda del calendario ("lun, 03/11"). */
export function fmtDateCorta(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

/** Título largo de un día ("lunes, 3 de noviembre de 2026"). */
export function fmtDateLarga(iso: string): string {
  return parseDateLocal(iso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function nombreDelMes(mes: number, anio: number): string {
  return new Date(anio, mes - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export type MesAnio = { mes: number; anio: number };

export function mesAnterior({ mes, anio }: MesAnio): MesAnio {
  return mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };
}

export function mesSiguiente({ mes, anio }: MesAnio): MesAnio {
  return mes === 12 ? { mes: 1, anio: anio + 1 } : { mes: mes + 1, anio };
}

export type DiaGrilla = { fecha: Date; esActual: boolean; esPasado: boolean; esOtroMes: boolean };

/**
 * Días de la grilla mensual 7×N (semana de lunes a domingo), con relleno de
 * días del mes anterior y siguiente para completar las semanas.
 */
export function diasDeLaGrilla(mes: number, anio: number, today = new Date()): DiaGrilla[] {
  const primerDia = new Date(anio, mes - 1, 1);
  const ultimoDia = new Date(anio, mes, 0);
  const out: DiaGrilla[] = [];
  let diaSemana = primerDia.getDay();
  diaSemana = diaSemana === 0 ? 6 : diaSemana - 1;
  for (let i = diaSemana - 1; i >= 0; i--) {
    out.push({
      fecha: new Date(anio, mes - 1, -i),
      esActual: false,
      esPasado: false,
      esOtroMes: true,
    });
  }
  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    const f = new Date(anio, mes - 1, d);
    const esHoy =
      d === today.getDate() && mes === today.getMonth() + 1 && anio === today.getFullYear();
    out.push({ fecha: f, esActual: esHoy, esPasado: f < today && !esHoy, esOtroMes: false });
  }
  const restante = 7 - (out.length % 7);
  if (restante < 7) {
    for (let i = 1; i <= restante; i++) {
      out.push({
        fecha: new Date(anio, mes, i),
        esActual: false,
        esPasado: false,
        esOtroMes: true,
      });
    }
  }
  return out;
}

// ============================================================================
// Calendario: totales del día
// ============================================================================

export function agruparPorFecha(
  items: CalendarioAcreditacion[],
): Map<string, CalendarioAcreditacion[]> {
  const m = new Map<string, CalendarioAcreditacion[]>();
  for (const it of items) {
    const arr = m.get(it.fechaAcreditacion) ?? [];
    arr.push(it);
    m.set(it.fechaAcreditacion, arr);
  }
  return m;
}

export type TotalesDia = {
  bruto: number;
  neto: number;
  adelantos: number;
  operaciones: number;
  /** Neto menos adelantos aplicados al día (nunca negativo). */
  libre: number;
};

export function totalesDelDia(items: CalendarioAcreditacion[]): TotalesDia {
  const bruto = items.reduce((s, i) => s + i.importeBruto, 0);
  const neto = items.reduce((s, i) => s + i.importeNeto, 0);
  const adelantos = items.reduce((s, i) => s + (i.adelantosAplicadosDia ?? 0), 0);
  const operaciones = items.reduce((s, i) => s + i.cantidadOperaciones, 0);
  return { bruto, neto, adelantos, operaciones, libre: Math.max(neto - adelantos, 0) };
}

/** % de la comisión de cierre de lote sobre el bruto (0 si no hay bruto). */
export function comisionCierrePct(it: CalendarioAcreditacion): number {
  return it.importeBruto > 0 ? (it.comisionCierreLoteMonto / it.importeBruto) * 100 : 0;
}

/** Neto del lote después de descontar el adelanto aplicado a ese día. */
export function netoFinalLote(it: CalendarioAcreditacion): number {
  return Math.max(it.importeNeto - (it.adelantosAplicadosDia ?? 0), 0);
}

const ADELANTO_CERRADO = new Set(["Acreditado", "Rechazado", "Cancelado"]);

export function adelantosEnCursoDelDia(adelantos: AdelantoParaCalendario[]) {
  return adelantos.filter((a) => !ADELANTO_CERRADO.has(a.estado));
}

/** Ticket cuya fecha de acreditación (o de solicitud) cae en `fecha`. */
export function ticketDelDia(tickets: Ticket[], fecha: string | null): Ticket | null {
  if (!fecha) return null;
  return tickets.find((t) => (t.fechaAcreditacion || t.fecha || "").slice(0, 10) === fecha) ?? null;
}

// ============================================================================
// Adelantos
// ============================================================================

/** Σ monto solicitado de los tickets pendientes o aprobados. */
export function montoReservado(tickets: Ticket[]): number {
  return tickets
    .filter((t) => ["pendiente", "aprobado"].includes(t.estado.toLowerCase()))
    .reduce((s, t) => s + t.montoSolicitado, 0);
}

/** Monto acreditado el día elegido, o todo lo por acreditar si no hay día. */
export function montoDelDia(
  fecha: string | null,
  dias: DiaAcreditacion[],
  porAcreditar: number,
): number {
  if (!fecha) return porAcreditar;
  const d = dias.find((x) => x.date === fecha);
  return d ? d.monto : porAcreditar;
}

/** Máximo que se puede adelantar: lo del día elegido, sin pasar el disponible. */
export function maxMontoAdelanto(
  fecha: string | null,
  dias: DiaAcreditacion[],
  disponible: number,
): number {
  if (!fecha) return disponible;
  const d = dias.find((x) => x.date === fecha);
  return d ? Math.min(d.monto, disponible) : disponible;
}

/**
 * Oferta de un adelanto aprobado. TEM = Tasa Efectiva Mensual.
 * Interés = monto × TEM / 100 (redondeado al centavo); neto = monto − interés.
 */
export function calcularOferta(montoSolicitado: number, tem: number) {
  const interes = Math.round(montoSolicitado * tem) / 100;
  const neto = Math.max(0, montoSolicitado - interes);
  return { interes, neto, tna: tem * 12 };
}

// ============================================================================
// Listados
// ============================================================================

/** Lotes acreditados, el más reciente (por fecha de acreditación) primero. */
export function ordenarAcreditados(lotes: LoteAcredDetalle[]): LoteAcredDetalle[] {
  return [...lotes].sort((a, b) => {
    const fa = a.fechaAcreditacion ?? a.fecha;
    const fb = b.fechaAcreditacion ?? b.fecha;
    return fb.localeCompare(fa);
  });
}

export function sumaImporteNeto(lotes: LoteAcredDetalle[]): number {
  return lotes.reduce((s, l) => s + Number(l.importeNeto ?? 0), 0);
}

export function paginar<T>(items: T[], page: number, pageSize: number) {
  return {
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    rows: items.slice((page - 1) * pageSize, page * pageSize),
    desde: (page - 1) * pageSize + 1,
    hasta: Math.min(page * pageSize, items.length),
  };
}
