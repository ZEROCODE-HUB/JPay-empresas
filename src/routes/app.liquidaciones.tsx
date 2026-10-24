import { createFileRoute } from "@tanstack/react-router";
import { resolveColor } from "@/brand/colors";
import { brand } from "@/brand/brand";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  Clock,
  CalendarDays,
  TrendingUp,
  ArrowUpRight,
  FileText,
  Download,
  FileSpreadsheet,
  Plus,
  Eye,
  X,
  Percent,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  PageHeader,
  Card,
  BtnPrimary,
  BtnOutline,
  Badge,
  Input,
  Label,
} from "@/components/portal-shell";
import { toast } from "sonner";
import { requireSupabase } from "@/lib/supabase";
import { formatARS } from "@/data/cobros-masivos";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

export const Route = createFileRoute("/app/liquidaciones")({ component: Liquidaciones });

type TicketEstado = "pendiente" | "aprobado" | "cancelado" | "rechazado" | "acreditado";
type Ticket = {
  id: string;
  fullId?: string;
  fecha: string;
  montoSolicitado: number;
  montoPorAcreditar: number;
  fechaAcreditacion: string;
  estado: TicketEstado;
  motivo?: string;
  tasaInteres?: number | null;
  plazoAdelantado?: number | null;
};

type DiaAcreditacion = {
  date: string; // YYYY-MM-DD
  label: string; // DD/MM
  monto: number;
  cantidad: number;
};

type LoteVenta = {
  id: string;
  fecha: string;
  bandera: string;
  cantidadOperaciones: number;
  montoOperaciones: number;
  comision: number;
  impuesto: number;
  montoCobrado: number;
};

type LoteAcredDetalle = {
  id: string;
  fullId?: string;
  fecha: string;
  fechaAcreditacion?: string;
  fechaCobroReal?: string | null;
  bandera: string;
  cantidadOperaciones: number;
  importeNeto: number;
  comisionCierrePct: number | null;
  comisionCierreMonto: number | null;
  estado?: string;
};

type ComisionBandera = {
  bandera: string;
  cuotas: number;
  tasaMensual: number;
  estado: string;
};

type Impuesto = {
  id: string;
  codigo: string;
  descripcion: string;
  tipo: string;
  alicuota: number;
  estado: string;
};

type Excepcion = {
  impuestoCodigo: string;
  motivo: string;
  estado: string;
  vigenciaHasta: string | null;
};

const ESTADO_TICKET_LABEL: Record<TicketEstado, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  cancelado: "Cancelado",
  rechazado: "Rechazado",
  acreditado: "Acreditado",
};
const ESTADO_TICKET_TONE: Record<TicketEstado, "neutral" | "success" | "warn" | "danger"> = {
  pendiente: "warn",
  aprobado: "success",
  cancelado: "neutral",
  rechazado: "danger",
  acreditado: "success",
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}
function fmtDateFull(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

type TabSeccion = "calendario" | "tickets" | "lotes-venta" | "comisiones" | "acreditaciones";

// ============================================================================
// CalendarioAcreditacionesTab
// ============================================================================
// Grilla mensual 7×N con desglose del día. Mismo shape que la pantalla
// admin/calendario-acreditaciones pero filtrado al comercio del usuario
// logueado y con textos/acciones del lado commerce.
//
// Datos: consume las RPCs `calendario_acreditaciones_v2`,
// `calendario_adelantos_por_dia`, `calendario_exportar_dia` y
// `calendario_resumen_saldos` (las 4 viven en el mismo proyecto Supabase).
// ============================================================================

const DIAS_SEMANA_CAL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const ESTADO_CAL_COLORS: Record<
  "programado" | "pendiente" | "acreditado" | "contracargo" | "cancelado",
  { bg: string; text: string; label: string; border: string }
> = {
  programado: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    border: "border-blue-300",
    label: "Programado",
  },
  pendiente: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-300",
    label: "Pendiente",
  },
  acreditado: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-300",
    label: "Acreditado",
  },
  contracargo: {
    bg: "bg-danger-100",
    text: "text-danger-700",
    border: "border-danger-300",
    label: "Contracargo",
  },
  cancelado: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-300",
    label: "Cancelado",
  },
};

function fmtDateCorta(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function parseDateLocalC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

import {
  listCalendarioAcreditaciones,
  getAdelantosPorDia,
  getExportDia,
  getMinMontoAdelanto,
  type CalendarioAcreditacion as CACal,
  type AdelantoParaCalendario,
  type EstadoCalendario,
} from "@/lib/api/calendario-acreditaciones";

function CalendarioAcreditacionesTab({
  comercioId,
  loading: parentLoading,
  tickets,
  onSelectDate,
  onOpenGeneral,
  onOpenDetalle,
}: {
  comercioId: string | null;
  loading: boolean;
  faltaCobrar: number;
  porAcreditar: number;
  adelantosEnCurso: number;
  disponible: number;
  tickets: Ticket[];
  onSelectDate: (date: string) => void;
  onClearSelection: () => void;
  onOpenGeneral: () => void;
  onOpenDetalle: (t: Ticket) => void;
}) {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [minMonto, setMinMonto] = useState<number>(100);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  useEffect(() => {
    let alive = true;
    getMinMontoAdelanto()
      .then((v) => alive && setMinMonto(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const { data: items = [], isLoading: loadingCal } = useQuery<CACal[]>({
    queryKey: ["calendario", comercioId, mes, anio],
    queryFn: () => {
      if (!comercioId) return Promise.resolve([]);
      return listCalendarioAcreditaciones({ mes, anio, comercioId });
    },
    enabled: !!comercioId,
    staleTime: 60_000,
  });

  // Map fechaAcreditacion → items del día
  const itemsPorFecha = useMemo(() => {
    const m = new Map<string, CACal[]>();
    for (const it of items) {
      const arr = m.get(it.fechaAcreditacion) ?? [];
      arr.push(it);
      m.set(it.fechaAcreditacion, arr);
    }
    return m;
  }, [items]);

  // Días del mes en grilla 7×N
  const diasDelMes = useMemo(() => {
    const today = new Date();
    const primerDia = new Date(anio, mes - 1, 1);
    const ultimoDia = new Date(anio, mes, 0);
    const out: { fecha: Date; esActual: boolean; esPasado: boolean; esOtroMes: boolean }[] = [];
    let diaSemana = primerDia.getDay();
    diaSemana = diaSemana === 0 ? 6 : diaSemana - 1;
    for (let i = diaSemana - 1; i >= 0; i--) {
      out.push({ fecha: new Date(anio, mes - 1, -i), esActual: false, esPasado: false, esOtroMes: true });
    }
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const f = new Date(anio, mes - 1, d);
      const esHoy = d === today.getDate() && mes === today.getMonth() + 1 && anio === today.getFullYear();
      out.push({ fecha: f, esActual: esHoy, esPasado: f < today && !esHoy, esOtroMes: false });
    }
    const restante = 7 - (out.length % 7);
    if (restante < 7) {
      for (let i = 1; i <= restante; i++) {
        out.push({ fecha: new Date(anio, mes, i), esActual: false, esPasado: false, esOtroMes: true });
      }
    }
    return out;
  }, [mes, anio]);

  // Para el modal: si hay día seleccionado, levantamos los adelantos del comercio
  // que se imputan a ese día. Lo cacheamos por fecha.
  const { data: adelantosDelDia = [] } = useQuery<AdelantoParaCalendario[]>({
    queryKey: ["calendario-adelantos-dia", comercioId, selectedDate],
    queryFn: () => {
      if (!comercioId || !selectedDate) return Promise.resolve([]);
      return getAdelantosPorDia(comercioId, selectedDate);
    },
    enabled: !!comercioId && !!selectedDate,
  });

  // Ticket activo del día (entre los tickets que ya tenemos en memoria)
  const ticketDelDia = useMemo<Ticket | null>(() => {
    if (!selectedDate) return null;
    return tickets.find((t) => {
      const fechaAcred = t.fechaAcreditacion || t.fecha || "";
      return fechaAcred.slice(0, 10) === selectedDate;
    }) ?? null;
  }, [selectedDate, tickets]);

  const itemsDelDia = selectedDate ? (itemsPorFecha.get(selectedDate) ?? []) : [];
  const totalBrutoDia = itemsDelDia.reduce((s, i) => s + i.importeBruto, 0);
  const totalNetoDia = itemsDelDia.reduce((s, i) => s + i.importeNeto, 0);
  const totalAdelantosDia = itemsDelDia.reduce(
    (s, i) => s + (i.adelantosAplicadosDia ?? 0),
    0,
  );
  const netoDespuesAdelantos = Math.max(totalNetoDia - totalAdelantosDia, 0);

  const onExport = async (formato: "xlsx" | "pdf") => {
    if (!selectedDate || !comercioId) return;
    setExporting(formato);
    try {
      const rows = await getExportDia(selectedDate, comercioId);
      if (rows.length === 0) {
        toast.error("No hay filas para exportar");
        return;
      }
      const titulo = parseDateLocalC(selectedDate).toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      if (formato === "xlsx") exportExcelDia(titulo, rows);
      else exportPdfDia(titulo, rows);
      toast.success(`Exportación ${formato.toUpperCase()} lista`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const mesAnterior = () => {
    if (mes === 1) {
      setMes(12);
      setAnio(anio - 1);
    } else setMes(mes - 1);
  };
  const mesSiguiente = () => {
    if (mes === 12) {
      setMes(1);
      setAnio(anio + 1);
    } else setMes(mes + 1);
  };
  const nombreMes = new Date(anio, mes - 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs text-muted-foreground">
          Cuánto te acredita {brand.name} cada día. Tocá un día para ver el detalle o solicitar un
          adelanto.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={mesAnterior}
            className="h-7 w-7 rounded-md border bg-card hover:bg-muted flex items-center justify-center"
            type="button"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-semibold min-w-[140px] text-center capitalize text-sm">
            {nombreMes}
          </span>
          <button
            onClick={mesSiguiente}
            className="h-7 w-7 rounded-md border bg-card hover:bg-muted flex items-center justify-center"
            type="button"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={14} />
          </button>
          <BtnOutline
            className="h-7 px-2 text-xs"
            onClick={() => {
              const t = new Date();
              setMes(t.getMonth() + 1);
              setAnio(t.getFullYear());
            }}
          >
            Hoy
          </BtnOutline>
        </div>
      </div>

      {parentLoading || loadingCal ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Cargando calendario…</div>
      ) : !comercioId ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No se pudo identificar tu comercio. Iniciá sesión nuevamente.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {DIAS_SEMANA_CAL.map((d) => (
              <div
                key={d}
                className="p-2 text-center text-xs font-semibold text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {diasDelMes.map((dia, idx) => {
              const fechaKey = dia.fecha.toISOString().slice(0, 10);
              const dayItems = itemsPorFecha.get(fechaKey) ?? [];
              const tieneItems = dayItems.length > 0;
              const totalBruto = dayItems.reduce((s, i) => s + i.importeBruto, 0);
              const totalAdelantos = dayItems.reduce(
                (s, i) => s + (i.adelantosAplicadosDia ?? 0),
                0,
              );
              const netoDelDia = Math.max(
                dayItems.reduce((s, i) => s + i.importeNeto, 0) - totalAdelantos,
                0,
              );
              const tieneAdelanto = totalAdelantos > 0;
              const cupoAgotado = tieneAdelanto && netoDelDia < minMonto;
              const isSelected = selectedDate === fechaKey;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => tieneItems && setSelectedDate(fechaKey)}
                  disabled={!tieneItems}
                  className={`text-left min-h-[110px] border-b border-r p-2 transition-colors ${
                    !dia.esOtroMes
                      ? dia.esPasado
                        ? "bg-emerald-50/20 hover:bg-emerald-50/40"
                        : "hover:bg-muted/30"
                      : "bg-muted/20 text-muted-foreground"
                  } ${dia.esActual ? "ring-2 ring-primary/30 bg-primary/5" : ""} ${
                    isSelected ? "ring-2 ring-secondary-200" : ""
                  } ${tieneItems ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={`text-sm font-semibold ${
                        dia.esActual ? "text-primary-ink" : ""
                      }`}
                    >
                      {fmtDateCorta(fechaKey)}
                    </span>
                    {tieneItems && (
                      <span className="text-[10px] bg-primary/10 text-primary-ink px-1.5 py-0.5 rounded">
                        {dayItems.reduce((s, i) => s + i.cantidadOperaciones, 0)} ops
                      </span>
                    )}
                  </div>
                  {tieneItems && (
                    <div className="space-y-1">
                      <div className="font-mono text-sm font-semibold">{formatARS(totalBruto)}</div>
                      {dayItems.slice(0, 2).map((it) => {
                        const color = ESTADO_CAL_COLORS[it.estadoCalculado];
                        return (
                          <div
                            key={it.id}
                            className={`text-[10px] p-1 rounded truncate ${color.bg} ${color.text}`}
                            title={`${it.bandera} · ${formatARS(it.importeBruto)}`}
                          >
                            {it.bandera}
                          </div>
                        );
                      })}
                      {dayItems.length > 2 && (
                        <div className="text-[10px] text-muted-foreground text-center">
                          +{dayItems.length - 2} más
                        </div>
                      )}
                      {tieneAdelanto && (
                        <div className="mt-1 rounded bg-amber-100 border border-amber-300 px-1.5 py-1 text-[10px] text-amber-800">
                          <div className="font-semibold flex items-center gap-1">
                            <Percent size={10} /> Adelanto
                          </div>
                          <div className="font-mono">-{formatARS(totalAdelantos)}</div>
                          <div className="font-mono">Libre: {formatARS(netoDelDia)}</div>
                          {cupoAgotado && (
                            <div className="text-danger-700 font-semibold mt-0.5">Cupo agotado</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {Object.entries(ESTADO_CAL_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded ${val.bg}`} />
            <span>{val.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300" />
          <span>Adelanto reservado</span>
        </div>
      </div>

      {/* Modal de detalle del día */}
      {selectedDate && itemsDelDia.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedDate(null)} />
          <div className="relative bg-card rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-card border-b px-6 py-4 z-10">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                    <CalendarDays size={18} />
                    {parseDateLocalC(selectedDate).toLocaleDateString("es-AR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {itemsDelDia.length} lote{itemsDelDia.length !== 1 ? "s" : ""} ·{" "}
                    {itemsDelDia.reduce((s, i) => s + i.cantidadOperaciones, 0)} operaciones
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onExport("xlsx")}
                    disabled={exporting !== null}
                    className="h-8 px-3 rounded-md border bg-card text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
                    type="button"
                  >
                    {exporting === "xlsx" ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <FileSpreadsheet size={12} />
                    )}
                    Excel
                  </button>
                  <button
                    onClick={() => onExport("pdf")}
                    disabled={exporting !== null}
                    className="h-8 px-3 rounded-md border bg-card text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
                    type="button"
                  >
                    {exporting === "pdf" ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    PDF
                  </button>
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="p-1.5 hover:bg-muted rounded-md"
                    type="button"
                    aria-label="Cerrar"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <div className="text-muted-foreground">Total bruto</div>
                  <div className="font-mono font-semibold text-base">
                    {formatARS(totalBrutoDia)}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <div className="text-muted-foreground">Total neto</div>
                  <div className="font-mono font-semibold text-base text-emerald-700">
                    {formatARS(totalNetoDia)}
                  </div>
                </div>
                <div className="rounded-md border bg-amber-50 border-amber-200 px-3 py-2">
                  <div className="text-amber-700">Adelantos reservados</div>
                  <div className="font-mono font-semibold text-base text-amber-700">
                    {formatARS(totalAdelantosDia)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Banner amarillo de adelantos en curso */}
              {adelantosDelDia.some(
                (a) =>
                  a.estado !== "Acreditado" && a.estado !== "Rechazado" && a.estado !== "Cancelado",
              ) && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-700">
                    <Percent size={12} /> Adelanto en curso
                  </div>
                  <div className="text-amber-700 mt-1 space-y-0.5">
                    {adelantosDelDia
                      .filter(
                        (a) =>
                          a.estado !== "Acreditado" &&
                          a.estado !== "Rechazado" &&
                          a.estado !== "Cancelado",
                      )
                      .map((a) => {
                        const t = tickets.find((x) => x.fullId === a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              if (t) onOpenDetalle(t);
                            }}
                            className="block w-full text-left hover:underline"
                          >
                            {a.estado} · {formatARS(a.montoPorAcreditar ?? a.montoSolicitado)} ·
                            Tkt #{a.id.slice(0, 8).toUpperCase()}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {itemsDelDia.map((it) => {
                const color = ESTADO_CAL_COLORS[it.estadoCalculado];
                const comisionCierrePct =
                  it.importeBruto > 0
                    ? (it.comisionCierreLoteMonto / it.importeBruto) * 100
                    : 0;
                const netoFinal = Math.max(
                  it.importeNeto - (it.adelantosAplicadosDia ?? 0),
                  0,
                );
                return (
                  <Card key={it.id} className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-semibold text-sm">
                          {it.bandera} · {it.codigo}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {it.cantidadOperaciones} operaciones
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${color.bg} ${color.text}`}>
                        {color.label}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left py-1 font-medium">Concepto</th>
                            <th className="text-right py-1 font-medium">Importe</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          <tr>
                            <td className="py-1">Importe bruto del lote</td>
                            <td className="text-right">{formatARS(it.importeBruto)}</td>
                          </tr>
                          <tr className="text-danger-600">
                            <td className="py-1">
                              (-) Comisión {brand.name} ({it.tasaPropiaPct.toFixed(2)}%)
                            </td>
                            <td className="text-right">-{formatARS(it.tasaPropiaMonto)}</td>
                          </tr>
                          <tr className="text-danger-600">
                            <td className="py-1">
                              (-) Comisión PayWay ({it.tasaPaywayPct.toFixed(2)}%)
                            </td>
                            <td className="text-right">-{formatARS(it.tasaPaywayMonto)}</td>
                          </tr>
                          <tr className="text-danger-600">
                            <td className="py-1">
                              (-) Comisión cierre de lote ({comisionCierrePct.toFixed(2)}%)
                            </td>
                            <td className="text-right">-{formatARS(it.comisionCierreLoteMonto)}</td>
                          </tr>
                          <tr className="text-danger-600">
                            <td className="py-1">(-) Impuestos</td>
                            <td className="text-right">-{formatARS(it.impuestos)}</td>
                          </tr>
                          {it.contracargoMonto > 0 && (
                            <tr className="text-danger-600">
                              <td className="py-1">(-) Contracargo</td>
                              <td className="text-right">-{formatARS(it.contracargoMonto)}</td>
                            </tr>
                          )}
                          {it.adelantosAplicadosDia > 0 && (
                            <tr className="text-amber-700">
                              <td className="py-1">(-) Adelanto aplicado a este día</td>
                              <td className="text-right">
                                -{formatARS(it.adelantosAplicadosDia)}
                              </td>
                            </tr>
                          )}
                          <tr className="border-t-2 font-semibold">
                            <td className="py-1.5">= Neto a recibir en tu Operativa</td>
                            <td className="text-right text-emerald-700">{formatARS(netoFinal)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}

              {/* Acciones del pie del modal */}
              <div className="mt-3 pt-3 border-t flex items-center justify-end gap-2">
                {ticketDelDia ? (
                  <button
                    type="button"
                    onClick={() => onOpenDetalle(ticketDelDia)}
                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5"
                  >
                    <Eye size={14} /> Ver mi ticket
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (netoDespuesAdelantos < minMonto) {
                        toast.error(
                          `El remanente libre (${formatARS(netoDespuesAdelantos)}) es menor al mínimo (${formatARS(minMonto)}).`,
                        );
                        return;
                      }
                      onSelectDate(selectedDate);
                    }}
                    disabled={netoDespuesAdelantos < minMonto}
                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus size={14} /> Solicitar adelanto
                  </button>
                )}
                <BtnOutline onClick={onOpenGeneral}>
                  <ArrowUpRight size={14} /> Solicitar general
                </BtnOutline>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Export helpers (por día)
// ============================================================================

function exportExcelDia(titulo: string, rows: { id: string; codigo: string; nombreComercio: string | null; legajo: string; bandera: string; estado: string; cantidadOperaciones: number; importeBruto: number; tasaPropiaPct: number; tasaPropiaMonto: number; tasaPaywayPct: number; tasaPaywayMonto: number; comisionCierreLoteMonto: number; impuestos: number; contracargoMonto: number; importeNeto: number; }[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.utils.book_new();
  const data = rows.map((r) => ({
    Lote: r.codigo,
    Comercio: r.nombreComercio ?? "—",
    Legajo: r.legajo,
    Bandera: r.bandera,
    Estado: r.estado,
    Operaciones: r.cantidadOperaciones,
    "Importe bruto": r.importeBruto,
    [`Comisión ${brand.name}`]: r.tasaPropiaMonto,
    "Comisión PayWay": r.tasaPaywayMonto,
    "Comisión cierre lote": r.comisionCierreLoteMonto,
    Impuestos: r.impuestos,
    Contracargo: r.contracargoMonto,
    "Importe neto": r.importeNeto,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 30));
  const safe = titulo.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
  XLSX.writeFile(wb, `calendario_${safe}.xlsx`);
}

function exportPdfDia(titulo: string, rows: { codigo: string; nombreComercio: string | null; bandera: string; estado: string; cantidadOperaciones: number; importeBruto: number; tasaPropiaMonto: number; tasaPaywayMonto: number; comisionCierreLoteMonto: number; impuestos: number; contracargoMonto: number; importeNeto: number; }[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = require("jspdf") as typeof import("jspdf");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const autoTableMod = require("jspdf-autotable") as { default: (doc: import("jspdf").jsPDF, opts: unknown) => void };
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(`Calendario de Acreditaciones — ${titulo}`, 14, 16);
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString("es-AR")}`, 14, 22);
  autoTableMod.default(doc, {
    startY: 28,
    head: [
      [
        "Lote",
        "Comercio",
        "Bandera",
        "Estado",
        "Ops",
        "Bruto",
        brand.name,
        "PayWay",
        "Cierre",
        "Impuestos",
        "Contracargo",
        "Neto",
      ],
    ],
    body: rows.map((r) => [
      r.codigo,
      r.nombreComercio ?? "—",
      r.bandera,
      r.estado,
      String(r.cantidadOperaciones),
      formatARS(r.importeBruto),
      formatARS(r.tasaPropiaMonto),
      formatARS(r.tasaPaywayMonto),
      formatARS(r.comisionCierreLoteMonto),
      formatARS(r.impuestos),
      formatARS(r.contracargoMonto),
      formatARS(r.importeNeto),
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [33, 37, 41] },
  });
  const safe = titulo.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
  doc.save(`calendario_${safe}.pdf`);
}

function Liquidaciones() {
  const [loading, setLoading] = useState(true);
  const [faltaCobrar, setFaltaCobrar] = useState(0);
  const [porAcreditar, setPorAcreditar] = useState(0);
  const [adelantosEnCurso, setAdelantosEnCurso] = useState(0);
  const [disponible, setDisponible] = useState(0);
  const [comercioId, setComercioId] = useState<string | null>(null);
  const [dias, setDias] = useState<DiaAcreditacion[]>([]);
  const [diasAcreditados, setDiasAcreditados] = useState<DiaAcreditacion[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [lotesVenta, setLotesVenta] = useState<LoteVenta[]>([]);
  const [lotesAcredDetalle, setLotesAcredDetalle] = useState<LoteAcredDetalle[]>([]);
  const [lotesAcreditados, setLotesAcreditados] = useState<LoteAcredDetalle[]>([]);
  const [comisiones, setComisiones] = useState<ComisionBandera[]>([]);
  const [impuestos, setImpuestos] = useState<Impuesto[]>([]);
  const [excepciones, setExcepciones] = useState<Excepcion[]>([]);

  // tabs & paginación
  const [activeTab, setActiveTab] = useState<TabSeccion>("calendario");
  const [calPage, setCalPage] = useState(1);
  const [calPageSize, setCalPageSize] = useState(10);
  const [tickPage, setTickPage] = useState(1);
  const [tickPageSize, setTickPageSize] = useState(10);
  const [ventaPage, setVentaPage] = useState(1);
  const [ventaPageSize, setVentaPageSize] = useState(10);
  const [acredPage, setAcredPage] = useState(1);
  const [acredPageSize, setAcredPageSize] = useState(10);

  // form
  const [open, setOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const [fechaAcred, setFechaAcred] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [detalle, setDetalle] = useState<Ticket | null>(null);

  const ROWS_OPTIONS = [10, 20, 50];

  const calTotalPages = Math.max(1, Math.ceil(dias.length / calPageSize));
  const calPaginated = dias.slice((calPage - 1) * calPageSize, calPage * calPageSize);
  const tickTotalPages = Math.max(1, Math.ceil(tickets.length / tickPageSize));
  const tickPaginated = tickets.slice((tickPage - 1) * tickPageSize, tickPage * tickPageSize);
  const ventaTotalPages = Math.max(1, Math.ceil(lotesVenta.length / ventaPageSize));
  const ventaPaginated = lotesVenta.slice(
    (ventaPage - 1) * ventaPageSize,
    ventaPage * ventaPageSize,
  );
  // "Acreditaciones" lista los lotes ya acreditados con su fecha de
  // resolución. Ordenamos por fecha de resolución desc para que el más
  // reciente quede arriba.
  const acredSorted = useMemo(
    () =>
      [...lotesAcreditados].sort((a, b) => {
        const fa = a.fechaAcreditacion ?? a.fecha;
        const fb = b.fechaAcreditacion ?? b.fecha;
        return fb.localeCompare(fa);
      }),
    [lotesAcreditados],
  );
  const acredTotalPages = Math.max(1, Math.ceil(acredSorted.length / acredPageSize));
  const acredPaginated = acredSorted.slice(
    (acredPage - 1) * acredPageSize,
    acredPage * acredPageSize,
  );

  /**
   * Mapa fecha (YYYY-MM-DD) → ticket activo. La UI del calendario lo
   * usa para pintar el badge "Adelanto en curso" y cambiar el botón
   * "Adelantar" por "Ver ticket" cuando ya hay un ticket cubriendo
   * ese lote. Se recomputa solo cuando `tickets` cambia.
   *
   * Estados que cuentan como "compromiso en curso" para el lote:
   *   - Pendiente: el comercio pidió, aún no fue revisado
   *   - Aprobado:  el admin cargó TEM, falta Acreditar
   *   - Acreditado: el admin ya pagó, se repone al liquidar el lote
   *
   * Si hay más de un ticket para la misma fecha, conservamos el más
   * "comprometido" (Acreditado > Aprobado > Pendiente) para no perder
   * estado al re-renderizar.
   */
  const ticketPorFecha = useMemo<Record<string, Ticket>>(() => {
    const mapa: Record<string, Ticket> = {};
    const orden = { pendiente: 0, aprobado: 1, acreditado: 2 } as Record<string, number>;
    for (const t of tickets) {
      const fechaKey = (t.fechaAcreditacion || t.fecha || "").slice(0, 10);
      if (!fechaKey) continue;
      const estadoNorm = t.estado.toLowerCase();
      if (!(estadoNorm in orden)) continue;
      const previo = mapa[fechaKey];
      if (!previo || orden[estadoNorm] > (orden[previo.estado.toLowerCase()] ?? -1)) {
        mapa[fechaKey] = t;
      }
    }
    return mapa;
  }, [tickets]);

  const totalSeleccionado = useMemo(() => {
    if (!selectedDate) return porAcreditar;
    const d = dias.find((x) => x.date === selectedDate);
    return d ? d.monto : porAcreditar;
  }, [selectedDate, dias, porAcreditar]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const sb = requireSupabase();
        const { data: u } = await sb.auth.getUser();
        const mail = u.user?.email ?? null;

        // 0) Resolver el legajo y el comercioId del usuario logueado.
        //    Traemos ambos valores de una vez: clientes.legajo para
        //    las tablas indexadas por legajo, y comercios.id (UUID)
        //    para las indexadas por comercio_id. Las RLS no siempre
        //    restringen por usuario en estas tablas, así que el
        //    filtrado en el front es obligatorio.
        let legajo: string | null = null;
        let comercioId: string | null = null;
        if (mail) {
          const { data: cli } = await sb
            .from("clientes")
            .select("legajo")
            .eq("correo", mail)
            .maybeSingle();
          legajo = cli?.legajo ?? null;

          if (legajo) {
            const { data: com } = await sb
              .from("comercios")
              .select("id")
              .eq("legajo", legajo)
              .maybeSingle();
            comercioId = com?.id ?? null;
            if (comercioId) setComercioId(comercioId);
          }
        }

        // 1) Falta cobrar: usamos la RPC `calendario_resumen_saldos` que es
        //    la fuente única de verdad (suma de lotes_venta sin lote_acreditacion).
        let falta = 0;
        let adelantosEnCursoCalc = 0;
        if (comercioId) {
          try {
            const { data: resumenRpc, error: rpcErr } = await sb.rpc(
              "calendario_resumen_saldos",
              { p_comercio_id: comercioId },
            );
            if (!rpcErr && resumenRpc) {
              const r = resumenRpc as Record<string, unknown>;
              falta = Number(r.falta_cobrar ?? 0);
              adelantosEnCursoCalc = Number(r.adelantos_en_curso ?? 0);
            }
          } catch (e) {
            console.warn("calendario_resumen_saldos no disponible, fallback:", e);
          }
        }

        // 2) Lotes de acreditación del comercio logueado. Filtramos
        //    por comercio_id explícitamente (no por RLS) y separamos
        //    los pendientes (calendario futuro) de los ya Acreditados
        //    (historial), porque un lote Acreditado no es "por acreditar".
        let acreditar = 0;
        let disp = 0;
        const ticketsReal: Ticket[] = [];
        const porDia: Record<string, { monto: number; cantidad: number }> = {};
        const porDiaAcreditado: Record<string, { monto: number; cantidad: number }> = {};
        let acredDetalle: LoteAcredDetalle[] = [];
        let acredListado: LoteAcredDetalle[] = [];

        if (comercioId) {
          const { data: loteRows } = await sb
            .from("lotes_acreditacion")
            .select(
              "id, fecha, cantidad_operaciones, importe_neto, estado, comision_cierre_lote_pct, comision_cierre_lote_monto, bandera, fecha_resolucion, fecha_cobro_real",
            )
            .eq("comercio_id", comercioId);

          const rows = (loteRows ?? []) as any[];
          const pendientes = rows.filter(
            (l) => l.estado !== "Acreditado" && l.estado !== "Rechazado" && l.estado !== "Cancelado",
          );
          const acreditados = rows.filter((l) => l.estado === "Acreditado");
          // KPI "Por acreditar": solo los pendientes (los Acreditados ya están pagados).
          acreditar = pendientes.reduce((s, l) => s + Number(l.importe_neto ?? 0), 0);

          // Detalle completo de TODOS los lotes (para que el operador
          // pueda ver también el historial de los Acreditados al
          // seleccionar una fecha).
          acredDetalle = rows.map((l) => ({
            id: String(l.id).slice(0, 8).toUpperCase(),
            fullId: l.id,
            fecha: (l.fecha ?? "").slice(0, 10),
            fechaAcreditacion:
              l.fecha_resolucion != null
                ? new Date(l.fecha_resolucion).toISOString().slice(0, 10)
                : "",
            fechaCobroReal: l.fecha_cobro_real ?? null,
            bandera: l.bandera ?? "—",
            cantidadOperaciones: Number(l.cantidad_operaciones ?? 0),
            importeNeto: Number(l.importe_neto ?? 0),
            comisionCierrePct:
              l.comision_cierre_lote_pct != null ? Number(l.comision_cierre_lote_pct) : null,
            comisionCierreMonto:
              l.comision_cierre_lote_monto != null ? Number(l.comision_cierre_lote_monto) : null,
            estado: l.estado,
          }));
          acredListado = acredDetalle.filter((l) => l.estado === "Acreditado");

          // Calendario de próximas acreditaciones.
          pendientes.forEach((l) => {
            const fecha = (l.fecha ?? "").slice(0, 10);
            if (!fecha) return;
            if (!porDia[fecha]) porDia[fecha] = { monto: 0, cantidad: 0 };
            porDia[fecha].monto += Number(l.importe_neto ?? 0);
            porDia[fecha].cantidad += Number(l.cantidad_operaciones ?? 0);
          });
          // Calendario de acreditaciones pasadas (para mostrar el
          // historial de pagos confirmados).
          acreditados.forEach((l) => {
            const fecha = (l.fecha ?? "").slice(0, 10);
            if (!fecha) return;
            if (!porDiaAcreditado[fecha]) porDiaAcreditado[fecha] = { monto: 0, cantidad: 0 };
            porDiaAcreditado[fecha].monto += Number(l.importe_neto ?? 0);
            porDiaAcreditado[fecha].cantidad += Number(l.cantidad_operaciones ?? 0);
          });

          // 3) Adelantos del propio comercio. Filtro por comercio_id.
          const { data: adelRows } = await sb
            .from("adelantos")
            .select(
              "id, monto_solicitado, monto_por_acreditar, fecha_acreditacion, estado, motivo, fecha_solicitud, created_at, tasa_interes_pct, plazo_adelantado_dias, fecha_resolucion",
            )
            .eq("comercio_id", comercioId);

          // El "Disponible para adelanto" sale de la RPC `fn_calcular_tope_disponible`
          // (fuente única de verdad). Si la RPC no existe todavía (migración
          // no aplicada), caemos al cálculo JS para no romper la pantalla.
          try {
            const { data: topeRpc, error: rpcError } = await sb.rpc(
              "fn_calcular_tope_disponible",
              { p_comercio_id: comercioId },
            );
            if (!rpcError) {
              disp = Math.max(0, Number(topeRpc ?? 0));
            } else {
              throw new Error(rpcError.message);
            }
          } catch {
            const reservado = (adelRows ?? []).reduce(
              (s: number, a: any) =>
                s +
                (a.estado === "Pendiente" || a.estado === "Aprobado"
                  ? Number(a.monto_solicitado ?? 0)
                  : 0),
              0,
            );
            disp = Math.max(0, acreditar - reservado);
          }

          ticketsReal.push(
            ...((adelRows ?? []) as any[]).map((r: any) => ({
              id: String(r.id).slice(0, 8).toUpperCase(),
              fullId: r.id,
              fecha: (r.fecha_solicitud ?? r.created_at ?? "").slice(0, 10),
              montoSolicitado: Number(r.monto_solicitado ?? 0),
              montoPorAcreditar: Number(r.monto_por_acreditar ?? 0),
              fechaAcreditacion: (r.fecha_acreditacion ?? "").slice(0, 10),
              estado: ((r.estado ?? "pendiente") as string).toLowerCase() as TicketEstado,
              motivo: r.motivo ?? undefined,
              tasaInteres: r.tasa_interes_pct != null ? Number(r.tasa_interes_pct) : null,
              plazoAdelantado:
                r.plazo_adelantado_dias != null ? Number(r.plazo_adelantado_dias) : null,
            })),
          );
          // Σ adelantos en curso (Pendiente + Aprobado)
          adelantosEnCursoCalc = (adelRows ?? [])
            .filter((r: any) => r.estado === "Pendiente" || r.estado === "Aprobado")
            .reduce(
              (s: number, r: any) => s + Number(r.monto_por_acreditar ?? r.monto_solicitado ?? 0),
              0,
            );
        }

        // 4) Lotes de venta — filtrado por comercio_id.
        let ventaRows: LoteVenta[] = [];
        try {
          let q = sb.from("v_lotes_venta").select("*").order("fecha", { ascending: false });
          if (comercioId) q = q.eq("comercio_id", comercioId);
          const { data: vRows } = await q;
          ventaRows = (vRows ?? []).map((r: any) => ({
            id: String(r.id ?? "")
              .slice(0, 8)
              .toUpperCase(),
            fecha: (r.fecha ?? "").slice(0, 10),
            bandera: r.bandera ?? "—",
            cantidadOperaciones: Number(r.cantidad_operaciones ?? r.cantidad ?? 0),
            montoOperaciones: Number(r.monto_operaciones ?? r.monto ?? 0),
            comision: Number(r.comision ?? 0),
            impuesto: Number(r.impuesto ?? 0),
            montoCobrado: Number(r.monto_cobrado ?? 0),
          }));
        } catch {
          // v_lotes_venta puede no existir aún; se muestra vacío
        }

        // 5) Comisiones por bandera y cuota (filtradas por legajo,
        //    ya estaba bien).
        let comisionesData: ComisionBandera[] = [];
        try {
          const { data: cbRows } = await sb
            .from("comercio_banderas")
            .select("id, bandera, estado")
            .eq("cliente_legajo", legajo);
          if (cbRows && cbRows.length > 0) {
            const cbIds = (cbRows as any[]).map((r: any) => r.id);
            const { data: cuotasRows } = await sb
              .from("comercio_banderas_cuotas")
              .select("comercio_bandera_id, cuotas, tasa_mensual, estado")
              .in("comercio_bandera_id", cbIds);
            const banderaMap = new Map((cbRows as any[]).map((r: any) => [r.id, r.bandera]));
            comisionesData = (cuotasRows ?? []).map((c: any) => ({
              bandera: banderaMap.get(c.comercio_bandera_id) ?? "—",
              cuotas: Number(c.cuotas ?? 0),
              tasaMensual: Number(c.tasa_mensual ?? 0),
              estado: c.estado ?? "Activo",
            }));
          }
        } catch {
          // Tablas aún no creadas
        }

        // 6) Impuestos externos + excepciones del comercio
        let impuestosData: Impuesto[] = [];
        let excepcionesData: Excepcion[] = [];
        try {
          const { data: impRows } = await sb
            .from("impuestos")
            .select("id, codigo, descripcion, tipo, alicuota, estado, ambito")
            .eq("ambito", "Externo")
            .eq("estado", "Activo");
          impuestosData = (impRows ?? []).map((r: any) => ({
            id: r.id,
            codigo: r.codigo ?? "",
            descripcion: r.descripcion ?? "",
            tipo: r.tipo ?? "",
            alicuota: Number(r.alicuota ?? 0),
            estado: r.estado ?? "Activo",
          }));

          if (legajo) {
            const { data: excRows } = await sb
              .from("dc_excepciones")
              .select("tipo, motivo, estado, vigencia_hasta, impuesto_id")
              .eq("legajo", legajo)
              .eq("estado", "Activo");
            const impIdToCodigo = new Map(impuestosData.map((i) => [i.id, i.codigo]));
            excepcionesData = (excRows ?? []).map((r: any) => ({
              impuestoCodigo: impIdToCodigo.get(r.impuesto_id) ?? r.tipo ?? "—",
              motivo: r.motivo ?? r.tipo ?? "Exención",
              estado: r.estado ?? "Activo",
              vigenciaHasta: r.vigencia_hasta ?? null,
            }));
          }
        } catch {
          // Tablas aún no disponibles
        }

        if (cancelled) return;
        setFaltaCobrar(falta);
        setPorAcreditar(acreditar);
        setAdelantosEnCurso(adelantosEnCursoCalc);
        setDisponible(disp);
        setLotesAcredDetalle(acredDetalle);
        setLotesAcreditados(acredListado);
        setLotesVenta(ventaRows);
        setComisiones(comisionesData);
        setImpuestos(impuestosData);
        setExcepciones(excepcionesData);
        const diasArr: DiaAcreditacion[] = Object.entries(porDia)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({
            date,
            label: fmtDate(date),
            monto: v.monto,
            cantidad: v.cantidad,
          }));
        setDias(diasArr);
        const acredArr: DiaAcreditacion[] = Object.entries(porDiaAcreditado)
          .sort(([a], [b]) => b.localeCompare(a)) // más reciente primero
          .map(([date, v]) => ({
            date,
            label: fmtDate(date),
            monto: v.monto,
            cantidad: v.cantidad,
          }));
        setDiasAcreditados(acredArr);
        setTickets(ticketsReal);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openForDate = (date: string) => {
    setSelectedDate(date);
    setFechaAcred(date);
    const d = dias.find((x) => x.date === date);
    if (d) setMonto(String(Math.round(d.monto)));
    setMotivo("");
    setOpen(true);
  };
  const openGeneral = () => {
    setSelectedDate(null);
    setFechaAcred(dias[0]?.date ?? toISO(addDays(new Date(), 1)));
    setMonto(disponible > 0 ? String(Math.round(disponible)) : "");
    setMotivo("");
    setOpen(true);
  };

  const handleCreate = async () => {
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (!fechaAcred) {
      toast.error("Seleccioná una fecha de acreditación");
      return;
    }
    if (montoNum > disponible) {
      toast.error("El monto no puede superar el disponible para adelanto");
      return;
    }
    setSaving(true);
    try {
      const sb = requireSupabase();
      // Alta con validación server-side (RPC security definer): recalcula el
      // disponible y rechaza si el monto supera el pendiente por acreditar.
      const { data, error } = await sb.rpc("ingresar_adelanto", {
        monto: montoNum,
        fecha_acreditacion: fechaAcred,
        motivo: motivo || null,
      });
      if (error) throw new Error(error.message);
      const row = data as any;
      const nuevo: Ticket = {
        id: String(row?.id ?? Date.now())
          .slice(0, 8)
          .toUpperCase(),
        fullId: row?.id ?? undefined,
        fecha: (row?.fecha_solicitud ?? new Date().toISOString()).slice(0, 10),
        montoSolicitado: Number(row?.monto_solicitado ?? montoNum),
        montoPorAcreditar: Number(row?.monto_por_acreditar ?? porAcreditar),
        fechaAcreditacion: (row?.fecha_acreditacion ?? fechaAcred).slice(0, 10),
        estado: "pendiente",
        motivo: motivo || undefined,
        tasaInteres: row?.tasa_interes_pct != null ? Number(row.tasa_interes_pct) : null,
        plazoAdelantado:
          row?.plazo_adelantado_dias != null ? Number(row.plazo_adelantado_dias) : null,
      };
      setTickets((prev) => [nuevo, ...prev]);
      setDisponible((prev) => Math.max(0, prev - montoNum));
      setOpen(false);
      toast.success(`Ticket ${nuevo.id} creado — pendiente de aprobación`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear el ticket");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (adelantoId?: string) => {
    if (!adelantoId) {
      toast.error("No se pudo identificar el adelantar");
      return;
    }
    setSaving(true);
    try {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("cancelar_adelanto", {
        p_adelanto_id: adelantoId,
      });
      if (error) throw new Error(error.message);
      const row = data as any;
      setTickets((prev) =>
        prev.map((t) =>
          t.fullId === adelantoId
            ? { ...t, estado: (row?.estado ?? "cancelado").toLowerCase() as TicketEstado }
            : t,
        ),
      );
      setDetalle((prev) =>
        prev && prev.fullId === adelantoId
          ? { ...prev, estado: (row?.estado ?? "cancelado").toLowerCase() as TicketEstado }
          : null,
      );
      toast.success("Adelanto cancelado correctamente");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cancelar el adelantar");
    } finally {
      setSaving(false);
    }
  };

  const exportLoteDetalle = (fecha: string) => {
    const lotesDelDia = lotesAcredDetalle.filter((l) => l.fecha === fecha);
    if (lotesDelDia.length === 0) {
      toast.error("No hay lotes para exportar en esta fecha");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(
      lotesDelDia.map((l) => ({
        Lote: l.id,
        Fecha: fmtDateFull(l.fecha),
        Bandera: l.bandera,
        Operaciones: l.cantidadOperaciones,
        "Importe neto": formatARS(l.importeNeto),
        "Comisión cierre %": l.comisionCierrePct != null ? `${l.comisionCierrePct}%` : "—",
        "Comisión cierre $": l.comisionCierreMonto != null ? formatARS(l.comisionCierreMonto) : "—",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detalle lote");
    XLSX.writeFile(wb, `lote-acreditacion-${fecha}.xlsx`);
    toast.success("Excel descargado");
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet([
      { Metrica: "Falta cobrar (por cobrar)", Valor: formatARS(faltaCobrar) },
      { Metrica: `Por acreditar (${brand.name} te debe)`, Valor: formatARS(porAcreditar) },
      { Metrica: "Disponible para adelanto", Valor: formatARS(disponible) },
      {},
      ...dias.map((d) => ({
        Metrica: `Acredita ${fmtDateFull(d.date)}`,
        Valor: formatARS(d.monto),
        Cantidad: d.cantidad,
      })),
      {},
      ...tickets.map((t) => ({
        Ticket: t.id,
        Fecha: t.fecha,
        "Monto solicitado": formatARS(t.montoSolicitado),
        "Fecha acreditación": fmtDateFull(t.fechaAcreditacion),
        Estado: ESTADO_TICKET_LABEL[t.estado],
      })),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Liquidaciones");
    XLSX.writeFile(wb, `liquidaciones-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel descargado");
  };
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFillColor(...resolveColor("primary"));
    doc.rect(0, 0, 210, 24, "F");
    doc.setTextColor(...resolveColor("on-primary"));
    doc.setFontSize(16);
    doc.text(brand.name, 14, 16);
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(10);
    doc.text(`Liquidaciones · ${new Date().toLocaleDateString("es-AR")}`, 196, 16, {
      align: "right",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      startY: 30,
      head: [["Concepto", "Monto"]],
      body: [
        ["Falta cobrar", formatARS(faltaCobrar)],
        ["Por acreditar", formatARS(porAcreditar)],
        ["Disponible adelanto", formatARS(disponible)],
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Fecha acredita", "Monto", "Ops"]],
      body: dias.map((d) => [fmtDateFull(d.date), formatARS(d.monto), String(d.cantidad)]),
      styles: { fontSize: 8 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Ticket", "Fecha", "Monto solicitado", "Acredita", "Estado"]],
      body: tickets.map((t) => [
        t.id,
        t.fecha,
        formatARS(t.montoSolicitado),
        fmtDateFull(t.fechaAcreditacion),
        ESTADO_TICKET_LABEL[t.estado],
      ]),
      styles: { fontSize: 7 },
    });
    doc.save(`liquidaciones-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF descargado");
  };

  const maxMonto = useMemo(() => {
    if (!selectedDate) return disponible;
    const d = dias.find((x) => x.date === selectedDate);
    return d ? Math.min(d.monto, disponible) : disponible;
  }, [selectedDate, dias, disponible]);

  return (
    <>
      <PageHeader
        title="Liquidaciones"
        description="Cuánta plata te falta cobrar, cuánto tenés por acreditar y calendario de acreditaciones. Solicitá el adelanto ahí mismo."
        action={
          <div className="flex gap-2">
            <BtnOutline onClick={exportExcel}>
              <FileSpreadsheet size={14} /> Excel
            </BtnOutline>
            <BtnOutline onClick={exportPDF}>
              <Download size={14} /> PDF
            </BtnOutline>
            <BtnPrimary onClick={openGeneral}>
              <Plus size={14} /> Solicitar adelanto
            </BtnPrimary>
          </div>
        }
      />

      {/* KPIs: 4 cards (Falta cobrar / Por acreditar / Adelantos en curso / Disponible real) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="border-l-4 border-l-amber-500">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock size={12} /> Falta cobrar
          </div>
          <div className="font-display tabular-nums text-xl md:text-2xl font-bold mt-1">
            {loading ? "—" : formatARS(faltaCobrar)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Ventas sin lote aún</div>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Wallet size={12} /> Por acreditar
          </div>
          <div className="font-display tabular-nums text-xl md:text-2xl font-bold mt-1 text-blue-700">
            {loading ? "—" : formatARS(porAcreditar)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Lotes no Acreditados</div>
        </Card>
        <Card className="border-l-4 border-l-amber-600">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Percent size={12} /> Adelantos en curso
          </div>
          <div className="font-display tabular-nums text-xl md:text-2xl font-bold mt-1 text-amber-700">
            {loading ? "—" : formatARS(adelantosEnCurso)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Pendiente + Aprobado</div>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TrendingUp size={12} /> Disponible real
          </div>
          <div className="font-display tabular-nums text-xl md:text-2xl font-bold mt-1 text-emerald-700">
            {loading ? "—" : formatARS(disponible)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Por acreditar − en curso</div>
        </Card>
      </div>

      {/* Sección combinada: Calendario + Tickets */}
      <Card className="mb-6 p-0">
        {/* Tabs header */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("calendario")}
            className={`flex-1 px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "calendario"
                ? "border-b-2 border-primary text-primary-ink bg-muted/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            <CalendarDays size={15} /> Calendario de acreditaciones
          </button>
          <button
            onClick={() => setActiveTab("tickets")}
            className={`flex-1 px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "tickets"
                ? "border-b-2 border-primary text-primary-ink bg-muted/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            <FileText size={15} /> Tickets de adelanto
            {tickets.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">
                {tickets.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("acreditaciones")}
            className={`flex-1 px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "acreditaciones"
                ? "border-b-2 border-primary text-primary-ink bg-muted/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            <CheckCircle2 size={15} /> Acreditaciones
            {lotesAcreditados.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                {lotesAcreditados.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("lotes-venta")}
            className={`flex-1 px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "lotes-venta"
                ? "border-b-2 border-primary text-primary-ink bg-muted/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            <FileSpreadsheet size={15} /> Lotes de venta
            {lotesVenta.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">
                {lotesVenta.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("comisiones")}
            className={`flex-1 px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "comisiones"
                ? "border-b-2 border-primary text-primary-ink bg-muted/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            <Percent size={15} /> Comisiones
          </button>
        </div>

        {/* Tab: Calendario — grilla mensual 7×N con desglose por día */}
        {activeTab === "calendario" && (
          <CalendarioAcreditacionesTab
            comercioId={comercioId}
            loading={loading}
            faltaCobrar={faltaCobrar}
            porAcreditar={porAcreditar}
            adelantosEnCurso={adelantosEnCurso}
            disponible={disponible}
            tickets={tickets}
            onSelectDate={(d) => {
              setSelectedDate(d);
              setFechaAcred(d);
              const match = dias.find((x) => x.date === d);
              if (match) setMonto(String(Math.round(match.monto)));
              setMotivo("");
            }}
            onClearSelection={() => setSelectedDate(null)}
            onOpenGeneral={openGeneral}
            onOpenDetalle={setDetalle}
          />
        )}

        {/* Tab: Tickets */}
        {activeTab === "tickets" && (
          <div>
            <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">{tickets.length} solicitudes</div>
              <BtnPrimary className="h-9 px-3 text-xs" onClick={openGeneral}>
                <Plus size={14} /> Nuevo ticket
              </BtnPrimary>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Ticket</th>
                    <th className="text-left px-5 py-3">Fecha solicitud</th>
                    <th className="text-right px-5 py-3">Monto solicitado</th>
                    <th className="text-left px-5 py-3">Acredita</th>
                    <th className="text-left px-5 py-3">Estado</th>
                    <th className="text-center px-5 py-3">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tickets.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-10 text-center text-sm text-muted-foreground"
                      >
                        Aún no solicitaste adelantos. Elegí un día del calendario y creá tu primer
                        ticket.
                      </td>
                    </tr>
                  ) : (
                    tickPaginated.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/30">
                        <td className="px-5 py-3 font-mono font-semibold">{t.id}</td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {fmtDateFull(t.fecha)}
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-right font-semibold">
                          {formatARS(t.montoSolicitado)}
                        </td>
                        <td className="px-5 py-3 text-xs">{fmtDateFull(t.fechaAcreditacion)}</td>
                        <td className="px-5 py-3">
                          <Badge tone={ESTADO_TICKET_TONE[t.estado]}>
                            {ESTADO_TICKET_LABEL[t.estado]}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <BtnOutline className="h-8 px-2.5 text-xs" onClick={() => setDetalle(t)}>
                            <Eye size={13} /> Ver
                          </BtnOutline>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Paginación tickets */}
            {tickets.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-t">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Filas por página:</span>
                  <select
                    className="h-8 px-2 rounded border bg-card text-xs"
                    value={tickPageSize}
                    onChange={(e) => {
                      setTickPageSize(Number(e.target.value));
                      setTickPage(1);
                    }}
                  >
                    {ROWS_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span>
                    {tickets.length === 0
                      ? "0 registros"
                      : `${(tickPage - 1) * tickPageSize + 1}–${Math.min(tickPage * tickPageSize, tickets.length)} de ${tickets.length}`}
                  </span>
                </div>
                <div className="flex gap-1">
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={tickPage <= 1}
                    onClick={() => setTickPage(1)}
                  >
                    Primero
                  </BtnOutline>
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={tickPage <= 1}
                    onClick={() => setTickPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </BtnOutline>
                  <span className="flex items-center px-3 text-xs text-muted-foreground">
                    {tickPage} / {tickTotalPages}
                  </span>
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={tickPage >= tickTotalPages}
                    onClick={() => setTickPage((p) => Math.min(tickTotalPages, p + 1))}
                  >
                    Siguiente
                  </BtnOutline>
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={tickPage >= tickTotalPages}
                    onClick={() => setTickPage(tickTotalPages)}
                  >
                    Último
                  </BtnOutline>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Acreditaciones (historial de lotes ya Acreditados) */}
        {activeTab === "acreditaciones" && (
          <div>
            <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                Lotes que ya fueron acreditados a tu subcuenta Operativa (estado{" "}
                <Badge tone="success">Acreditado</Badge>). Suma:{" "}
                <span className="font-mono font-semibold text-emerald-700">
                  {formatARS(
                    lotesAcreditados.reduce((s, l) => s + Number(l.importeNeto ?? 0), 0),
                  )}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Lote</th>
                    <th className="text-left px-5 py-3">Bandera</th>
                    <th className="text-right px-5 py-3">Operaciones</th>
                    <th className="text-right px-5 py-3">Importe neto</th>
                    <th className="text-left px-5 py-3">Fecha estimada</th>
                    <th className="text-left px-5 py-3">Cobro real</th>
                    <th className="text-left px-5 py-3">Acreditado el</th>
                    <th className="text-center px-5 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {acredSorted.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-10 text-center text-sm text-muted-foreground"
                      >
                        Aún no tenés acreditaciones registradas.
                      </td>
                    </tr>
                  ) : (
                    acredPaginated.map((l) => (
                      <tr key={l.fullId ?? l.id} className="hover:bg-muted/30">
                        <td className="px-5 py-3 font-mono font-semibold">{l.id}</td>
                        <td className="px-5 py-3">
                          <Badge tone="neutral">{l.bandera}</Badge>
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {l.cantidadOperaciones}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {formatARS(l.importeNeto)}
                        </td>
                        <td className="px-5 py-3 text-xs">{fmtDateFull(l.fecha)}</td>
                        <td className="px-5 py-3 text-xs">
                          {l.fechaCobroReal ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono">{fmtDateFull(l.fechaCobroReal)}</span>
                              <Badge tone="success">real</Badge>
                            </div>
                          ) : (
                            <Badge tone="neutral">est.</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs font-mono">
                          {l.fechaAcreditacion ? fmtDateFull(l.fechaAcreditacion) : "—"}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <Badge tone="success">Acreditado</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {acredSorted.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-t">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Filas por página:</span>
                  <select
                    className="h-8 px-2 rounded border bg-card text-xs"
                    value={acredPageSize}
                    onChange={(e) => {
                      setAcredPageSize(Number(e.target.value));
                      setAcredPage(1);
                    }}
                  >
                    {ROWS_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span>
                    {`${(acredPage - 1) * acredPageSize + 1}–${Math.min(acredPage * acredPageSize, acredSorted.length)} de ${acredSorted.length}`}
                  </span>
                </div>
                <div className="flex gap-1">
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={acredPage <= 1}
                    onClick={() => setAcredPage(1)}
                  >
                    Primero
                  </BtnOutline>
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={acredPage <= 1}
                    onClick={() => setAcredPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </BtnOutline>
                  <span className="flex items-center px-3 text-xs text-muted-foreground">
                    {acredPage} / {acredTotalPages}
                  </span>
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={acredPage >= acredTotalPages}
                    onClick={() => setAcredPage((p) => Math.min(acredTotalPages, p + 1))}
                  >
                    Siguiente
                  </BtnOutline>
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={acredPage >= acredTotalPages}
                    onClick={() => setAcredPage(acredTotalPages)}
                  >
                    Último
                  </BtnOutline>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Lotes de venta */}
        {activeTab === "lotes-venta" && (
          <div>
            <div className="px-5 py-3 border-b">
              <div className="text-xs text-muted-foreground">
                Ventas del comercio por fecha y bandera. Datos de la vista{" "}
                <code className="bg-muted px-1 rounded">v_lotes_venta</code>.
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Fecha</th>
                    <th className="text-left px-5 py-3">Bandera</th>
                    <th className="text-right px-5 py-3">Ops</th>
                    <th className="text-right px-5 py-3">Monto operaciones</th>
                    <th className="text-right px-5 py-3">Comisión</th>
                    <th className="text-right px-5 py-3">Impuesto</th>
                    <th className="text-right px-5 py-3">Monto cobrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lotesVenta.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-10 text-center text-sm text-muted-foreground"
                      >
                        No se encontraron lotes de venta.
                      </td>
                    </tr>
                  ) : (
                    ventaPaginated.map((v, idx) => (
                      <tr key={`${v.fecha}-${v.bandera}-${idx}`} className="hover:bg-muted/30">
                        <td className="px-5 py-3 text-xs">{fmtDateFull(v.fecha)}</td>
                        <td className="px-5 py-3">
                          <Badge tone="neutral">{v.bandera}</Badge>
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {v.cantidadOperaciones}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold">
                          {formatARS(v.montoOperaciones)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-muted-foreground">
                          {formatARS(v.comision)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-muted-foreground">
                          {formatARS(v.impuesto)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {formatARS(v.montoCobrado)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {lotesVenta.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-t">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Filas por página:</span>
                  <select
                    className="h-8 px-2 rounded border bg-card text-xs"
                    value={ventaPageSize}
                    onChange={(e) => {
                      setVentaPageSize(Number(e.target.value));
                      setVentaPage(1);
                    }}
                  >
                    {ROWS_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span>
                    {`${(ventaPage - 1) * ventaPageSize + 1}–${Math.min(ventaPage * ventaPageSize, lotesVenta.length)} de ${lotesVenta.length}`}
                  </span>
                </div>
                <div className="flex gap-1">
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={ventaPage <= 1}
                    onClick={() => setVentaPage(1)}
                  >
                    Primero
                  </BtnOutline>
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={ventaPage <= 1}
                    onClick={() => setVentaPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </BtnOutline>
                  <span className="flex items-center px-3 text-xs text-muted-foreground">
                    {ventaPage} / {ventaTotalPages}
                  </span>
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={ventaPage >= ventaTotalPages}
                    onClick={() => setVentaPage((p) => Math.min(ventaTotalPages, p + 1))}
                  >
                    Siguiente
                  </BtnOutline>
                  <BtnOutline
                    className="h-8 px-3 text-xs"
                    disabled={ventaPage >= ventaTotalPages}
                    onClick={() => setVentaPage(ventaTotalPages)}
                  >
                    Último
                  </BtnOutline>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Comisiones por bandera y cuota */}
        {activeTab === "comisiones" && (
          <div>
            <div className="px-5 py-3 border-b">
              <div className="text-xs text-muted-foreground">
                Comisiones vigentes por bandera y cuota. Solo lectura — tasas configuradas por el
                administrador.
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Bandera</th>
                    <th className="text-right px-5 py-3">Cuotas</th>
                    <th className="text-right px-5 py-3">Tasa mensual (TEM)</th>
                    <th className="text-center px-5 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {comisiones.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-10 text-center text-sm text-muted-foreground"
                      >
                        No hay comisiones configuradas para tu comercio. El administrador debe
                        asignar banderas y cuotas primero.
                      </td>
                    </tr>
                  ) : (
                    comisiones.map((c, idx) => (
                      <tr key={`${c.bandera}-${c.cuotas}-${idx}`} className="hover:bg-muted/30">
                        <td className="px-5 py-3">
                          <Badge tone="neutral">{c.bandera}</Badge>
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">{c.cuotas}x</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold">
                          {c.tasaMensual}%
                        </td>
                        <td className="px-5 py-3 text-center">
                          <Badge tone={c.estado === "Activo" ? "success" : "neutral"}>
                            {c.estado}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t text-[11px] text-muted-foreground">
              La tasa mensual (TEM) es el porcentaje que se aplica mensualmente sobre el monto de
              cada cuota. No se muestra la tasa anual (TNA).
            </div>
          </div>
        )}
      </Card>

      {/* Sección: Impuestos aplicables (solo Externo) */}
      {impuestos.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Percent size={16} className="text-muted-foreground" />
            <h3 className="font-semibold text-sm">Impuestos aplicables a tu comercio</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Solo se muestran impuestos de ámbito Externo. Los impuestos internos de {brand.name} no se
            visualizan.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2">Código</th>
                  <th className="text-left px-4 py-2">Descripción</th>
                  <th className="text-right px-4 py-2">Tipo</th>
                  <th className="text-right px-4 py-2">Alicuota / Fijo</th>
                  <th className="text-center px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {impuestos.map((imp) => {
                  const exento = excepciones.find(
                    (e) => e.impuestoCodigo === imp.codigo && e.estado === "Activo",
                  );
                  return (
                    <tr key={imp.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{imp.codigo}</td>
                      <td className="px-4 py-2 text-xs">{imp.descripcion}</td>
                      <td className="px-4 py-2 text-right text-xs">{imp.tipo}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">
                        {imp.tipo === "Porcentaje" ? `${imp.alicuota}%` : formatARS(imp.alicuota)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {exento ? (
                          <Badge tone="success">Exento</Badge>
                        ) : (
                          <Badge tone={imp.estado === "Activo" ? "warn" : "neutral"}>
                            {imp.estado}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {excepciones.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                Excepciones activas
              </div>
              {excepciones.map((exc, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <Badge tone="success">Exento</Badge>
                  <span>
                    {exc.impuestoCodigo} — {exc.motivo}
                  </span>
                  {exc.vigenciaHasta && (
                    <span className="text-muted-foreground">
                      (hasta {fmtDateFull(exc.vigenciaHasta)})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !saving && setOpen(false)} />
          <div className="relative bg-card rounded-lg w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="font-semibold">Solicitar adelanto</div>
              <button
                onClick={() => !saving && setOpen(false)}
                className="p-1 hover:bg-muted rounded"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {dias.length === 0 ? (
                <>
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
                      <CalendarDays size={24} className="text-amber-500" />
                    </div>
                    <p className="text-sm font-medium">No tenés acreditaciones pendientes</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      No podés solicitar adelantos en este momento. Cuando tengas acreditaciones
                      pendientes, podrás adelantar los montos.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <BtnOutline className="flex-1" onClick={() => setOpen(false)}>
                      Cerrar
                    </BtnOutline>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-gradient-to-r from-emerald-50 to-card border border-emerald-200 rounded-md p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-medium mb-1">
                      <Wallet size={14} /> Tu adelanto disponible
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Por acreditar total</span>
                      <span className="font-mono">{formatARS(porAcreditar)}</span>
                    </div>
                    {(() => {
                      const reservados = tickets
                        .filter((t) => ["pendiente", "aprobado"].includes(t.estado.toLowerCase()))
                        .reduce((s, t) => s + t.montoSolicitado, 0);
                      if (reservados > 0) {
                        return (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              (-) Adelantos en curso
                            </span>
                            <span className="font-mono text-amber-700">
                              - {formatARS(reservados)}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="flex justify-between border-t border-emerald-200 pt-1">
                      <span className="text-muted-foreground font-semibold">
                        Disponible real
                      </span>
                      <span className="font-mono font-bold text-emerald-700 text-sm">
                        {formatARS(disponible)}
                      </span>
                    </div>
                    {selectedDate && (
                      <div className="flex justify-between pt-1 border-t border-emerald-200">
                        <span className="text-muted-foreground">Día seleccionado</span>
                        <span className="font-semibold">
                          {fmtDateFull(selectedDate)} · {formatARS(totalSeleccionado)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-blue-700 font-medium mb-1">
                      <Clock size={14} /> Recordatorio
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Comisión por acreditación</span>
                      <span className="font-mono font-semibold">$45 + IVA</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plazo de acreditación</span>
                      <span className="font-mono font-semibold">30 días</span>
                    </div>
                  </div>

                  <div>
                    <Label>Monto a adelantar (ARS)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={maxMonto}
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      placeholder="Ej. 500000"
                    />
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Máximo {formatARS(maxMonto)}
                    </div>
                  </div>
                  <div>
                    <Label>Fecha de acreditación que querés adelantar</Label>
                    <select
                      value={fechaAcred}
                      onChange={(e) => setFechaAcred(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border bg-card text-sm"
                    >
                      {dias.map((d) => (
                        <option key={d.date} value={d.date}>
                          {fmtDateFull(d.date)} · {formatARS(d.monto)} ({d.cantidad} ops)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Motivo (opcional)</Label>
                    <Input
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ej. adelanto liquidacion semana"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <BtnOutline className="flex-1" disabled={saving} onClick={() => setOpen(false)}>
                      Cancelar
                    </BtnOutline>
                    <BtnPrimary className="flex-1" disabled={saving} onClick={handleCreate}>
                      {saving ? "Creando…" : "Crear ticket"}
                    </BtnPrimary>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle ticket */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetalle(null)} />
          <div className="relative bg-card rounded-lg w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="font-semibold">Ticket {detalle.id}</div>
              <Badge tone={ESTADO_TICKET_TONE[detalle.estado]}>
                {ESTADO_TICKET_LABEL[detalle.estado]}
              </Badge>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha solicitud</span>
                <span className="font-semibold">{fmtDateFull(detalle.fecha)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto solicitado</span>
                <span className="font-mono font-semibold">
                  {formatARS(detalle.montoSolicitado)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha a adelantar</span>
                <span className="font-semibold">{fmtDateFull(detalle.fechaAcreditacion)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Por acreditar al momento</span>
                <span className="font-mono">{formatARS(detalle.montoPorAcreditar)}</span>
              </div>
              {detalle.motivo && (
                <div className="pt-3 border-t">
                  <div className="text-xs text-muted-foreground">Motivo</div>
                  <div className="mt-1">{detalle.motivo}</div>
                </div>
              )}
              {detalle.estado === "aprobado" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-medium mb-1">
                    <TrendingUp size={14} /> Oferta del administrador
                  </div>
                  <p className="text-[11px] text-emerald-900/80 mb-2">
                    Si estás conforme con la tasa, no hace falta confirmar: el
                    administrador procesará el pago en breve y vas a ver el neto
                    acreditado en tu Saldo Disponible.
                  </p>
                  {detalle.tasaInteres != null && (() => {
                    // Regla de negocio: TEM = Tasa Efectiva Mensual.
                    // Interés = monto_solicitado * TEM / 100
                    // Neto a recibir = monto_solicitado - Interés
                    const tem = detalle.tasaInteres;
                    const interes = Math.round(detalle.montoSolicitado * tem) / 100;
                    const neto = Math.max(0, detalle.montoSolicitado - interes);
                    const tna = tem * 12;
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monto solicitado</span>
                          <span className="font-mono font-semibold">
                            {formatARS(detalle.montoSolicitado)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tasa de interés (TEM)</span>
                          <span className="font-mono font-bold text-emerald-700">
                            {tem}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Costo financiero (interés)</span>
                          <span className="font-mono font-semibold text-danger-600">
                            - {formatARS(interes)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-emerald-200">
                          <span className="text-muted-foreground">Neto a recibir</span>
                          <span className="font-mono font-bold text-emerald-700">
                            {formatARS(neto)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">TNA equivalente</span>
                          <span className="font-mono text-muted-foreground">
                            {tna.toFixed(1)}%
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <BtnOutline className="flex-1" onClick={() => setDetalle(null)}>
                  Cerrar
                </BtnOutline>
                {(detalle.estado === "pendiente" || detalle.estado === "aprobado") && (
                  <button
                    className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-sm border border-danger-200 bg-white text-danger-600 text-sm font-semibold cursor-pointer hover:bg-danger-50 active:bg-danger-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex-1"
                    disabled={saving}
                    onClick={() => {
                      if (
                        confirm(
                          detalle.estado === "aprobado"
                            ? "¿Rechazás la oferta del administrador? El adelanto pasará a Cancelado y se liberará el cupo reservado de tus lotes."
                            : "¿Seguro que querés cancelar esta solicitud? Esta acción no se puede deshacer.",
                        )
                      ) {
                        handleCancel(detalle.fullId);
                      }
                    }}
                  >
                    {saving ? "Cancelando…" : "Cancelar adelantar"}
                  </button>
                )}
                <BtnPrimary
                  className="flex-1"
                  onClick={() => {
                    toast.success(`Comprobante ${detalle.id} descargado`);
                  }}
                >
                  <Download size={14} /> Comprobante
                </BtnPrimary>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

