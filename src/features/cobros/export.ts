import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  medioPagoLabels,
  type DashboardKPI,
  type LoteGestionRow,
  type MedioPagoData,
  type NoCobradasData,
  type RegistroDeLote,
  type VencimientoData,
} from "@/lib/api/cobros-masivos";
import { toResolvableLinkPagoUrl } from "@/lib/pay-url";
import { formatMoney } from "@/shared/format";
import { COLUMNAS_PLANTILLA } from "./carga";
import { ESTADO_LOTE_LABEL, REGISTRO_ESTADO_BADGE } from "./estados";
import { porcentaje } from "./utils";

type AutoTableDoc = jsPDF & { autoTable: (opts: Record<string, unknown>) => void };

// ===== Plantilla de carga =====

const FILA_EJEMPLO_EDIFICIO = [
  "edificio",
  "6",
  "UF 3D",
  "Perez, Juan",
  48200,
  "Expensas mensuales - Edificio 6",
  "juan@email.com",
  "",
  "",
  "2026-04-15",
  "2026-04-30",
  "2026-05-15",
  10,
  "TRANSFERENCIA|TARJETA_CREDITO",
  true,
];

const FILA_EJEMPLO_CLUB = [
  "club",
  "12",
  "Socio 145",
  "Romero, Pablo",
  15000,
  "Cuota social",
  "pablo.romero@email.com",
  "",
  "",
  "2026-04-10",
  "2026-04-25",
  "2026-05-10",
  5,
  "TRANSFERENCIA|QR",
  false,
];

/**
 * Descarga la plantilla XLSX de carga.
 * - `gestion`: dos filas de ejemplo, columnas con ancho por defecto.
 * - `nuevo`: una fila de ejemplo y columnas ensanchadas.
 */
export function descargarPlantilla(variante: "gestion" | "nuevo") {
  const headers = [...COLUMNAS_PLANTILLA];
  const filas =
    variante === "gestion" ? [FILA_EJEMPLO_EDIFICIO, FILA_EJEMPLO_CLUB] : [FILA_EJEMPLO_EDIFICIO];
  const ws = XLSX.utils.json_to_sheet(
    filas.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
    { header: headers },
  );
  if (variante === "nuevo") ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
  XLSX.writeFile(wb, "plantilla-cobros-masivos.xlsx");
}

// ===== Registros de un lote =====

/**
 * Exporta los registros de un lote a Excel.
 * `estadoConEtiqueta`: el detalle del lote exporta la etiqueta ("Pagado"); el modal de gestión
 * exporta el valor crudo ("pagado_total").
 */
export function exportarRegistrosExcel(
  registros: RegistroDeLote[],
  archivo: string,
  estadoConEtiqueta: boolean,
) {
  const rows = registros.map((r) => ({
    Descripcion: r.descripcion,
    Monto: r.monto,
    Pagado: r.montoPagado,
    "Fecha creacion": r.createdAt.slice(0, 10),
    "1er vencimiento": r.fechaVencimiento1 ?? "-",
    "2do vencimiento": r.fechaVencimiento2 ?? "-",
    "3er vencimiento": r.fechaVencimiento3 ?? "-",
    Email: r.email ?? "-",
    "Tipo entidad": r.tipoEntidad,
    "ID entidad": r.idEntidad,
    "Sub entidad": r.subEntidad,
    "Identificacion usuario": r.identificacionUsuario,
    "Fecha pago": r.fechaPago?.slice(0, 10) ?? "-",
    Estado: estadoConEtiqueta ? (REGISTRO_ESTADO_BADGE[r.estado]?.label ?? r.estado) : r.estado,
    "Link de pago": r.linkDePago ? toResolvableLinkPagoUrl(r.linkDePago) : "-",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Registros");
  XLSX.writeFile(wb, archivo);
}

// ===== Gestión de lotes =====

export function exportarLotesExcel(lotes: LoteGestionRow[]) {
  const rows = lotes.map((l) => ({
    ID: l.id,
    Nombre: l.nombre,
    Periodo: l.periodo,
    Estado: ESTADO_LOTE_LABEL[l.estado],
    "Fecha creacion": l.createdAt,
    "Fecha finalizacion": l.fechaFinalizacion ?? "-",
    Progreso: `${l.progreso}%`,
    "Pagos completos": l.cantidadPagos,
    "Pagos parciales": l.cantidadParciales,
    Pendientes: l.cantidadPendientes,
    "Monto total": l.montoTotal,
    "Monto cobrado": l.montoCobrado,
    "Por cobrar": l.montoPorCobrar,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lotes");
  XLSX.writeFile(wb, "cobros-masivos-lotes.xlsx");
}

export function exportarLotesPdf(lotes: LoteGestionRow[]) {
  const doc = new jsPDF("landscape");
  doc.text("Reporte de Lotes - Cobros Masivos", 14, 20);
  const total = lotes.reduce((s, l) => s + l.montoTotal, 0);
  const cobrado = lotes.reduce((s, l) => s + l.montoCobrado, 0);
  doc.text(
    `Monto total: ${formatMoney(total)} | Cobrado: ${formatMoney(cobrado)} | Tasa: ${porcentaje(cobrado, total)}%`,
    14,
    30,
  );
  const body = lotes.map((l) => [
    l.nombre,
    ESTADO_LOTE_LABEL[l.estado],
    `${l.progreso}%`,
    formatMoney(l.montoTotal),
    formatMoney(l.montoCobrado),
  ]);
  (doc as AutoTableDoc).autoTable({
    startY: 38,
    head: [["Nombre", "Estado", "Progreso", "Monto total", "Cobrado"]],
    body,
  });
  doc.save("cobros-masivos-lotes.pdf");
}

// ===== Dashboard =====

export interface DatosDashboard {
  kpi: DashboardKPI;
  porMedio: MedioPagoData[];
  porVencimiento: VencimientoData[];
  noCobradas: NoCobradasData;
}

export function exportarDashboardExcel(d: DatosDashboard, periodo: string) {
  const { kpi } = d;
  const ws = XLSX.utils.json_to_sheet([
    { Metrica: "Total de lotes", Valor: kpi.totalLotes },
    { Metrica: "En proceso", Valor: kpi.enProceso },
    { Metrica: "Finalizados", Valor: kpi.finalizados },
    { Metrica: "Con error", Valor: kpi.conError },
    { Metrica: "Monto total", Valor: formatMoney(kpi.montoTotal) },
    { Metrica: "Monto cobrado", Valor: formatMoney(kpi.montoCobrado) },
    { Metrica: "Monto pendiente", Valor: formatMoney(kpi.montoPendiente) },
    ...d.porMedio.map((m) => ({
      Metrica: `Monto ${medioPagoLabels[m.medio as keyof typeof medioPagoLabels] || m.medio}`,
      Valor: formatMoney(m.monto),
    })),
    ...d.porVencimiento.map((v) => ({
      Metrica: v.label,
      Valor: `${v.cantidad} ops - ${formatMoney(v.monto)}`,
    })),
    {
      Metrica: "Operaciones no cobradas",
      Valor: `${d.noCobradas.porcentajeNoCobrado}% - ${formatMoney(d.noCobradas.montoNoCobrado)}`,
    },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
  XLSX.writeFile(wb, `cobros-masivos-dashboard-${periodo}.xlsx`);
}

export function exportarDashboardPdf(kpi: DashboardKPI, periodo: string) {
  const doc = new jsPDF();
  doc.text("Dashboard - Cobros Masivos", 14, 20);
  doc.text(`Periodo: ${periodo}`, 14, 30);
  const body = [
    ["Total de lotes", String(kpi.totalLotes)],
    ["En proceso", String(kpi.enProceso)],
    ["Finalizados", String(kpi.finalizados)],
    ["Con error", String(kpi.conError)],
    ["Monto total", formatMoney(kpi.montoTotal)],
    ["Monto cobrado", formatMoney(kpi.montoCobrado)],
    ["Monto pendiente", formatMoney(kpi.montoPendiente)],
    ["Tasa de cobranza", `${porcentaje(kpi.montoCobrado, kpi.montoTotal)}%`],
  ];
  (doc as AutoTableDoc).autoTable({ startY: 38, head: [["Metrica", "Valor"]], body });
  doc.save(`cobros-masivos-dashboard-${periodo}.pdf`);
}
