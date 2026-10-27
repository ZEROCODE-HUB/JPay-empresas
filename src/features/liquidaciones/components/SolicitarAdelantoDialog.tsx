import { CalendarDays, Clock, Wallet } from "lucide-react";
import { BtnOutline, Input, Label } from "@/components/portal-shell";
import type { DiaAcreditacion, Ticket } from "@/lib/api/liquidaciones";
import { formatDate, formatMoney, monedaActiva } from "@/shared/format";
import { FormDialog } from "@/shared/ui/form-dialog";
import { ModalDialog } from "@/shared/ui/modal-dialog";
import type { SolicitudAdelanto } from "../hooks/useSolicitudAdelanto";
import { montoReservado } from "../utils";

export function SolicitarAdelantoDialog({
  s,
  dias,
  tickets,
  porAcreditar,
  disponible,
}: {
  s: SolicitudAdelanto;
  dias: DiaAcreditacion[];
  tickets: Ticket[];
  porAcreditar: number;
  disponible: number;
}) {
  const cerrar = () => !s.saving && s.cerrar();

  if (dias.length === 0) {
    return (
      <ModalDialog open={s.open} onClose={cerrar} title="Solicitar adelanto">
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
              <CalendarDays size={24} className="text-amber-500" />
            </div>
            <p className="text-sm font-medium">No tenés acreditaciones pendientes</p>
            <p className="text-xs text-muted-foreground mt-1">
              No podés solicitar adelantos en este momento. Cuando tengas acreditaciones pendientes,
              podrás adelantar los montos.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <BtnOutline className="flex-1" onClick={s.cerrar}>
              Cerrar
            </BtnOutline>
          </div>
        </div>
      </ModalDialog>
    );
  }

  const reservados = montoReservado(tickets);

  return (
    <FormDialog
      open={s.open}
      onClose={cerrar}
      title="Solicitar adelanto"
      onSubmit={s.crear}
      submitLabel={s.saving ? "Creando…" : "Crear ticket"}
      isSubmitting={s.saving}
    >
      <div className="bg-gradient-to-r from-emerald-50 to-card border border-emerald-200 rounded-md p-3 text-xs space-y-1">
        <div className="flex items-center gap-1.5 text-emerald-700 font-medium mb-1">
          <Wallet size={14} /> Tu adelanto disponible
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Por acreditar total</span>
          <span className="font-mono">{formatMoney(porAcreditar)}</span>
        </div>
        {reservados > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">(-) Adelantos en curso</span>
            <span className="font-mono text-amber-700">- {formatMoney(reservados)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-emerald-200 pt-1">
          <span className="text-muted-foreground font-semibold">Disponible real</span>
          <span className="font-mono font-bold text-emerald-700 text-sm">
            {formatMoney(disponible)}
          </span>
        </div>
        {s.selectedDate && (
          <div className="flex justify-between pt-1 border-t border-emerald-200">
            <span className="text-muted-foreground">Día seleccionado</span>
            <span className="font-semibold">
              {formatDate(s.selectedDate)} · {formatMoney(s.montoSeleccionado)}
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
        <Label>Monto a adelantar ({monedaActiva()})</Label>
        {/* Sin min/max/step nativos: dentro de <form> bloquearían el envío con el
            globo del navegador; la validación (con toast) la hace `crear`. */}
        <Input
          type="number"
          step="any"
          value={s.monto}
          onChange={(e) => s.setMonto(e.target.value)}
          placeholder="Ej. 500000"
        />
        <div className="text-[11px] text-muted-foreground mt-1">
          Máximo {formatMoney(s.maxMonto)}
        </div>
      </div>
      <div>
        <Label>Fecha de acreditación que querés adelantar</Label>
        <select
          value={s.fechaAcred}
          onChange={(e) => s.setFechaAcred(e.target.value)}
          className="w-full h-10 px-3 rounded-md border bg-card text-sm"
        >
          {dias.map((d) => (
            <option key={d.date} value={d.date}>
              {formatDate(d.date)} · {formatMoney(d.monto)} ({d.cantidad} ops)
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Motivo (opcional)</Label>
        <Input
          value={s.motivo}
          onChange={(e) => s.setMotivo(e.target.value)}
          placeholder="Ej. adelanto liquidacion semana"
        />
      </div>
    </FormDialog>
  );
}
