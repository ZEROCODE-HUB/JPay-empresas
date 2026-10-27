import { Activity, DollarSign, QrCode, Store, TrendingUp } from "lucide-react";
import type { DashboardQrDatos } from "@/lib/api/qr";
import { formatMoney } from "@/shared/format";

export const PRESETS = [
  { label: "Hoy", days: 0 },
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "60 dias", days: 60 },
  { label: "90 dias", days: 90 },
];

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export type Kpi = { icon: typeof QrCode; label: string; value: string };
export type Porcion = { name: string; value: number };
export type PuntoEvolucion = { mes: string; cobros: number; monto: number };

export type DashboardQrCalculado = {
  kpis: Kpi[];
  statusData: Porcion[];
  pdvData: Porcion[];
  evolucion: PuntoEvolucion[];
};

/** Inicio del período (00:00 local) para un preset; "Hoy" = desde hoy, N días incluye hoy. */
export function desdePreset(presetLabel: string, ahora = new Date()): string {
  const days = PRESETS.find((p) => p.label === presetLabel)?.days ?? 30;
  const since = new Date(ahora);
  since.setHours(0, 0, 0, 0);
  if (days > 0) since.setDate(since.getDate() - (days - 1));
  return since.toISOString();
}

/** KPIs, tortas y evolución mensual (últimos 6 meses con datos) del dashboard QR. */
const ESTADOS_EN_CURSO = new Set(["pendiente", "en progreso", "creado", "abierto"]);

export function calcularDashboardQr(
  datos: DashboardQrDatos | null | undefined,
): DashboardQrCalculado {
  if (!datos) return { kpis: [], statusData: [], pdvData: [], evolucion: [] };
  const { cobros: lista, estados, pdvsPorEstado } = datos;

  const nombreEstado = (id: number | null) =>
    estados?.find((e) => e.id === id)?.nombre ?? "Desconocido";

  const total = lista.length;
  const montoTotal = lista.reduce((a, m) => a + Number(m.monto_operacion ?? 0), 0);
  const aprobados = lista.filter(
    (m) => nombreEstado(m.estado_id).toLowerCase() === "aprobado",
  ).length;
  // Pendiente = todavía en curso; los rechazados/expirados no cuentan como pendientes.
  const pendientes = lista.filter((m) =>
    ESTADOS_EN_CURSO.has(nombreEstado(m.estado_id).toLowerCase()),
  ).length;
  const tasa = total ? (aprobados / total) * 100 : 0;
  const pdvActivos = pdvsPorEstado["Activado"] ?? 0;

  // Estado de cobros (pie)
  const porEstado: Record<string, number> = {};
  for (const m of lista) {
    const n = nombreEstado(m.estado_id);
    porEstado[n] = (porEstado[n] ?? 0) + 1;
  }
  const statusArr = Object.entries(porEstado).map(([name, value]) => ({ name, value }));

  // Evolución por mes (últimos 6)
  const porMes: Record<string, { cobros: number; monto: number }> = {};
  for (const m of lista) {
    const key = (m.fecha ?? "").slice(0, 7);
    if (!key) continue;
    porMes[key] = porMes[key] ?? { cobros: 0, monto: 0 };
    porMes[key].cobros += 1;
    porMes[key].monto += Number(m.monto_operacion ?? 0);
  }
  const meses = Object.keys(porMes).sort().slice(-6);
  const evArr = meses.map((k) => {
    const [, mm] = k.split("-");
    return {
      mes: MESES[parseInt(mm, 10) - 1] ?? k,
      cobros: porMes[k].cobros,
      monto: +(porMes[k].monto / 1_000_000).toFixed(2),
    };
  });

  const pdvArr = Object.entries(pdvsPorEstado).map(([name, value]) => ({ name, value }));

  return {
    kpis: [
      { icon: QrCode, label: "Total cobros QR", value: total.toString() },
      {
        icon: DollarSign,
        label: "Monto total recaudado",
        value: `${formatMoney(montoTotal, { decimals: 0 })} ARS`,
      },
      { icon: Activity, label: "Aprobadas", value: aprobados.toString() },
      { icon: TrendingUp, label: "Pendientes", value: pendientes.toString() },
      { icon: Store, label: "PDV activos", value: pdvActivos.toString() },
      { icon: TrendingUp, label: "Tasa de exito", value: tasa.toFixed(1) + "%" },
    ],
    statusData: statusArr,
    pdvData: pdvArr,
    evolucion: evArr,
  };
}
