import {
  ArrowUpRight,
  CalendarDays,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Percent,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BtnOutline } from "@/components/portal-shell";
import type {
  AdelantoParaCalendario,
  CalendarioAcreditacion,
} from "@/lib/api/calendario-acreditaciones";
import type { Ticket } from "@/lib/api/liquidaciones";
import { formatMoney } from "@/shared/format";
import { adelantosEnCursoDelDia, fmtDateLarga, ticketDelDia, totalesDelDia } from "../utils";
import { LoteDelDiaCard } from "./LoteDelDiaCard";

const EXPORT_BTN =
  "h-8 px-3 rounded-md border bg-card text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50";
const ACCION_BTN =
  "h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5";

/**
 * Detalle de un día del calendario: totales, adelantos en curso, desglose por
 * lote y acciones (ver ticket / solicitar adelanto). Modal propio (ancho y
 * cabecera fija con exportaciones y totales) en lugar de `ModalDialog`.
 */
export function DetalleDiaModal({
  fecha,
  items,
  adelantos,
  tickets,
  minMonto,
  exporting,
  onExport,
  onClose,
  onSelectDate,
  onOpenGeneral,
  onOpenDetalle,
}: {
  fecha: string;
  items: CalendarioAcreditacion[];
  adelantos: AdelantoParaCalendario[];
  tickets: Ticket[];
  minMonto: number;
  exporting: "xlsx" | "pdf" | null;
  onExport: (formato: "xlsx" | "pdf") => void;
  onClose: () => void;
  onSelectDate: (date: string) => void;
  onOpenGeneral: () => void;
  onOpenDetalle: (t: Ticket) => void;
}) {
  const tot = totalesDelDia(items);
  const enCurso = adelantosEnCursoDelDia(adelantos);
  const ticket = ticketDelDia(tickets, fecha);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-card border-b px-6 py-4 z-10">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <CalendarDays size={18} />
                {fmtDateLarga(fecha)}
              </h3>
              <p className="text-sm text-muted-foreground">
                {items.length} lote{items.length !== 1 ? "s" : ""} · {tot.operaciones} operaciones
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onExport("xlsx")}
                disabled={exporting !== null}
                className={EXPORT_BTN}
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
                className={EXPORT_BTN}
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
                onClick={onClose}
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
              <div className="font-mono font-semibold text-base">{formatMoney(tot.bruto)}</div>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground">Total neto</div>
              <div className="font-mono font-semibold text-base text-emerald-700">
                {formatMoney(tot.neto)}
              </div>
            </div>
            <div className="rounded-md border bg-amber-50 border-amber-200 px-3 py-2">
              <div className="text-amber-700">Adelantos reservados</div>
              <div className="font-mono font-semibold text-base text-amber-700">
                {formatMoney(tot.adelantos)}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {enCurso.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-amber-700">
                <Percent size={12} /> Adelanto en curso
              </div>
              <div className="text-amber-700 mt-1 space-y-0.5">
                {enCurso.map((a) => {
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
                      {a.estado} · {formatMoney(a.montoPorAcreditar ?? a.montoSolicitado)} · Tkt #
                      {a.id.slice(0, 8).toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {items.map((it) => (
            <LoteDelDiaCard key={it.id} it={it} />
          ))}

          <div className="mt-3 pt-3 border-t flex items-center justify-end gap-2">
            {ticket ? (
              <button type="button" onClick={() => onOpenDetalle(ticket)} className={ACCION_BTN}>
                <Eye size={14} /> Ver mi ticket
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (tot.libre < minMonto) {
                    toast.error(
                      `El remanente libre (${formatMoney(tot.libre)}) es menor al mínimo (${formatMoney(minMonto)}).`,
                    );
                    return;
                  }
                  onSelectDate(fecha);
                }}
                disabled={tot.libre < minMonto}
                className={`${ACCION_BTN} disabled:opacity-50`}
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
  );
}
