import type { ReactNode } from "react";
import { Download, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnOutline, BtnPrimary } from "@/components/portal-shell";
import type { Ticket } from "@/lib/api/liquidaciones";
import { formatDate, formatMoney } from "@/shared/format";
import { ESTADO_TICKET_LABEL, ESTADO_TICKET_TONE } from "../estados";
import { calcularOferta } from "../utils";

const CANCELAR_BTN =
  "inline-flex items-center justify-center gap-2 h-10 px-5 rounded-sm border border-danger-200 bg-white text-danger-600 text-sm font-semibold cursor-pointer hover:bg-danger-50 active:bg-danger-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex-1";

function Fila({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Oferta del admin para un adelanto aprobado (interés TEM y neto a recibir). */
function OfertaAprobada({ ticket }: { ticket: Ticket }) {
  const tem = ticket.tasaInteres;
  const oferta = tem != null ? calcularOferta(ticket.montoSolicitado, tem) : null;
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs space-y-1">
      <div className="flex items-center gap-1.5 text-emerald-700 font-medium mb-1">
        <TrendingUp size={14} /> Oferta del administrador
      </div>
      <p className="text-[11px] text-emerald-900/80 mb-2">
        Si estás conforme con la tasa, no hace falta confirmar: el administrador procesará el pago
        en breve y vas a ver el neto acreditado en tu Saldo Disponible.
      </p>
      {oferta && (
        <>
          <Fila label="Monto solicitado">
            <span className="font-mono font-semibold">{formatMoney(ticket.montoSolicitado)}</span>
          </Fila>
          <Fila label="Tasa de interés (TEM)">
            <span className="font-mono font-bold text-emerald-700">{tem}%</span>
          </Fila>
          <Fila label="Costo financiero (interés)">
            <span className="font-mono font-semibold text-danger-600">
              - {formatMoney(oferta.interes)}
            </span>
          </Fila>
          <div className="flex justify-between pt-1 border-t border-emerald-200">
            <span className="text-muted-foreground">Neto a recibir</span>
            <span className="font-mono font-bold text-emerald-700">{formatMoney(oferta.neto)}</span>
          </div>
          <Fila label="TNA equivalente">
            <span className="font-mono text-muted-foreground">{oferta.tna.toFixed(1)}%</span>
          </Fila>
        </>
      )}
    </div>
  );
}

/**
 * Detalle de un ticket de adelanto. Modal propio (no `ModalDialog`) porque la
 * cabecera muestra el badge de estado en lugar del botón de cerrar.
 */
export function DetalleTicketDialog({
  ticket,
  saving,
  onClose,
  onCancelar,
}: {
  ticket: Ticket | null;
  saving: boolean;
  onClose: () => void;
  onCancelar: (adelantoId?: string) => void;
}) {
  if (!ticket) return null;
  const cancelable = ticket.estado === "pendiente" || ticket.estado === "aprobado";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="font-semibold">Ticket {ticket.id}</div>
          <Badge tone={ESTADO_TICKET_TONE[ticket.estado]}>
            {ESTADO_TICKET_LABEL[ticket.estado]}
          </Badge>
        </div>
        <div className="p-6 space-y-3 text-sm">
          <Fila label="Fecha solicitud">
            <span className="font-semibold">{formatDate(ticket.fecha)}</span>
          </Fila>
          <Fila label="Monto solicitado">
            <span className="font-mono font-semibold">{formatMoney(ticket.montoSolicitado)}</span>
          </Fila>
          <Fila label="Fecha a adelantar">
            <span className="font-semibold">{formatDate(ticket.fechaAcreditacion)}</span>
          </Fila>
          <Fila label="Por acreditar al momento">
            <span className="font-mono">{formatMoney(ticket.montoPorAcreditar)}</span>
          </Fila>
          {ticket.motivo && (
            <div className="pt-3 border-t">
              <div className="text-xs text-muted-foreground">Motivo</div>
              <div className="mt-1">{ticket.motivo}</div>
            </div>
          )}
          {ticket.estado === "aprobado" && <OfertaAprobada ticket={ticket} />}
          <div className="flex gap-2 pt-4">
            <BtnOutline className="flex-1" onClick={onClose}>
              Cerrar
            </BtnOutline>
            {cancelable && (
              <button
                className={CANCELAR_BTN}
                disabled={saving}
                onClick={() => {
                  if (
                    confirm(
                      ticket.estado === "aprobado"
                        ? "¿Rechazás la oferta del administrador? El adelanto pasará a Cancelado y se liberará el cupo reservado de tus lotes."
                        : "¿Seguro que querés cancelar esta solicitud? Esta acción no se puede deshacer.",
                    )
                  ) {
                    onCancelar(ticket.fullId);
                  }
                }}
              >
                {saving ? "Cancelando…" : "Cancelar adelantar"}
              </button>
            )}
            <BtnPrimary
              className="flex-1"
              onClick={() => {
                toast.success(`Comprobante ${ticket.id} descargado`);
              }}
            >
              <Download size={14} /> Comprobante
            </BtnPrimary>
          </div>
        </div>
      </div>
    </div>
  );
}
