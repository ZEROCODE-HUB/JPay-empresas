import { ChevronLeft, ChevronRight, Percent } from "lucide-react";
import { brand } from "@/brand/brand";
import { BtnOutline } from "@/components/portal-shell";
import type { Ticket } from "@/lib/api/liquidaciones";
import { useMinMontoAdelanto } from "@/hooks/useLiquidaciones";
import { formatMoney } from "@/shared/format";
import { ESTADO_CAL_COLORS } from "../estados";
import { useCalendarioMes } from "../hooks/useCalendarioMes";
import { fmtDateCorta, nombreDelMes, totalesDelDia } from "../utils";
import { DetalleDiaModal } from "./DetalleDiaModal";

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const NAV_BTN = "h-7 w-7 rounded-md border bg-card hover:bg-muted flex items-center justify-center";

/**
 * Grilla mensual 7×N con desglose del día. Mismo shape que la pantalla
 * admin/calendario-acreditaciones pero filtrado al comercio del usuario
 * logueado y con textos/acciones del lado commerce.
 *
 * Datos: RPCs `calendario_acreditaciones_v2`, `calendario_adelantos_por_dia`
 * y `calendario_exportar_dia`.
 */
export function CalendarioTab({
  comercioId,
  loading: parentLoading,
  tickets,
  onSelectDate,
  onOpenGeneral,
  onOpenDetalle,
}: {
  comercioId: string | null;
  loading: boolean;
  tickets: Ticket[];
  onSelectDate: (date: string) => void;
  onOpenGeneral: () => void;
  onOpenDetalle: (t: Ticket) => void;
}) {
  const cal = useCalendarioMes(comercioId);
  const minMonto = useMinMontoAdelanto();

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs text-muted-foreground">
          Cuánto te acredita {brand.name} cada día. Tocá un día para ver el detalle o solicitar un
          adelanto.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={cal.irMesAnterior}
            className={NAV_BTN}
            type="button"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-semibold min-w-[140px] text-center capitalize text-sm">
            {nombreDelMes(cal.mes, cal.anio)}
          </span>
          <button
            onClick={cal.irMesSiguiente}
            className={NAV_BTN}
            type="button"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={14} />
          </button>
          <BtnOutline className="h-7 px-2 text-xs" onClick={cal.irHoy}>
            Hoy
          </BtnOutline>
        </div>
      </div>

      {parentLoading || cal.isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Cargando calendario…</div>
      ) : !comercioId ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No se pudo identificar tu comercio. Iniciá sesión nuevamente.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="p-2 text-center text-xs font-semibold text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cal.diasDelMes.map((dia, idx) => {
              const fechaKey = dia.fecha.toISOString().slice(0, 10);
              const dayItems = cal.itemsPorFecha.get(fechaKey) ?? [];
              const tieneItems = dayItems.length > 0;
              const tot = totalesDelDia(dayItems);
              const tieneAdelanto = tot.adelantos > 0;
              const cupoAgotado = tieneAdelanto && tot.libre < minMonto;
              const isSelected = cal.selectedDate === fechaKey;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => tieneItems && cal.setSelectedDate(fechaKey)}
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
                      className={`text-sm font-semibold ${dia.esActual ? "text-primary-ink" : ""}`}
                    >
                      {fmtDateCorta(fechaKey)}
                    </span>
                    {tieneItems && (
                      <span className="text-[10px] bg-primary/10 text-primary-ink px-1.5 py-0.5 rounded">
                        {tot.operaciones} ops
                      </span>
                    )}
                  </div>
                  {tieneItems && (
                    <div className="space-y-1">
                      <div className="font-mono text-sm font-semibold">
                        {formatMoney(tot.bruto)}
                      </div>
                      {dayItems.slice(0, 2).map((it) => {
                        const color = ESTADO_CAL_COLORS[it.estadoCalculado];
                        return (
                          <div
                            key={it.id}
                            className={`text-[10px] p-1 rounded truncate ${color.bg} ${color.text}`}
                            title={`${it.bandera} · ${formatMoney(it.importeBruto)}`}
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
                          <div className="font-mono">-{formatMoney(tot.adelantos)}</div>
                          <div className="font-mono">Libre: {formatMoney(tot.libre)}</div>
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

      {cal.selectedDate && cal.itemsDelDia.length > 0 && (
        <DetalleDiaModal
          fecha={cal.selectedDate}
          items={cal.itemsDelDia}
          adelantos={cal.adelantosDelDia}
          tickets={tickets}
          minMonto={minMonto}
          exporting={cal.exporting}
          onExport={cal.exportarDia}
          onClose={() => cal.setSelectedDate(null)}
          onSelectDate={(d) => {
            cal.setSelectedDate(null);
            onSelectDate(d);
          }}
          onOpenGeneral={() => {
            cal.setSelectedDate(null);
            onOpenGeneral();
          }}
          onOpenDetalle={onOpenDetalle}
        />
      )}
    </div>
  );
}
