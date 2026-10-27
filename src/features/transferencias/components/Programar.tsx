import { Clock, ShieldCheck, Users } from "lucide-react";
import { Input, Label, BtnPrimary, BtnOutline } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import type { FrequentRecipient } from "@/lib/api/transferencias";
import { useProgramar, type ProgramarProps } from "../hooks/useProgramar";
import { ConceptoSelect, FrecuentesPickerDialog, ResumenFilas } from "./campos";

/** Pestaña "Programar": alta o edición de una transferencia programada. */
export function Programar({
  frecuentes = [],
  ...props
}: ProgramarProps & {
  /** Frequent recipients to pick from the list (same as in the single transfer). */
  frecuentes?: FrequentRecipient[];
}) {
  const f = useProgramar(props);
  const { subcuentas } = props;
  const { destValid, editando } = f;

  if (f.confirm && destValid) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Revisa los datos antes de {editando ? "guardar los cambios" : "programar"}. Se validará de
          nuevo al ejecutar.
        </div>
        <ResumenFilas
          filas={[
            ["Origen", subcuentas.find((s) => s.id === f.subcuentaOrigen)?.nombre ?? "—"],
            ["Destinatario", destValid.titular?.nombre ?? destValid.identifier],
            ["Identificador", destValid.identifier + ` (${destValid.kind})`],
            ["Monto", formatMoney(Number(f.monto) || 0)],
            ["Fecha", f.fecha || "—"],
            ["Hora", f.hora],
          ]}
        />
        <div className="flex gap-2">
          <BtnOutline onClick={() => f.setConfirm(false)} className="flex-1">
            Volver
          </BtnOutline>
          <BtnPrimary disabled={f.guardando} onClick={f.guardar} className="flex-1">
            {f.guardando
              ? "Guardando..."
              : editando
                ? "Guardar cambios"
                : "Programar transferencia"}
          </BtnPrimary>
        </div>
      </div>
    );
  }

  return (
    <>
      <form className="space-y-4" onSubmit={f.revisar}>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Origen de fondos</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={f.subcuentaOrigen}
              onChange={(e) => f.setSubcuentaOrigen(e.target.value)}
            >
              {subcuentas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {formatMoney(Number(s.saldo_disponible))}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Destinatario (CBU/CVU/Alias)</Label>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="22 dígitos o alias (6-20)"
                value={f.destQuery}
                onChange={(e) => f.cambiarDestino(e.target.value)}
              />
              <BtnOutline
                type="button"
                onClick={() => void f.handleValidate()}
                disabled={f.validating}
              >
                {f.validating ? "Validando..." : "Validar"}
              </BtnOutline>
            </div>
            {destValid ? (
              <div className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                <ShieldCheck size={11} /> Validado: {destValid.titular?.nombre} —{" "}
                {destValid.titular?.banco ?? destValid.kind}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">
                Se validara contra el banco antes de programar.
              </div>
            )}
            <BtnOutline
              type="button"
              onClick={() => f.setFrecuentesOpen(true)}
              className="w-full mt-2"
            >
              <Users size={14} /> Destinatarios frecuentes
            </BtnOutline>
          </div>
          <div>
            <Label>Monto</Label>
            <Input
              placeholder="$ 0,00"
              value={f.monto}
              onChange={(e) => f.setMonto(e.target.value)}
            />
          </div>
          <div>
            <Label>Moneda</Label>
            <div className="h-10 px-3 rounded-md border bg-card flex items-center text-sm text-muted-foreground">
              ARS — Pesos Argentinos
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <div>
              <Label>Fecha de envio (hora Argentina)</Label>
              <Input type="date" value={f.fecha} onChange={(e) => f.setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Hora de envio (hora Argentina)</Label>
              <Input type="time" value={f.hora} onChange={(e) => f.setHora(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Concepto</Label>
            <ConceptoSelect value={f.concepto} onChange={f.setConcepto} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Clock size={11} /> Se ejecuta sola a esa fecha y hora (hora Argentina). No hace falta que
          hagas nada.
        </p>
        <div className="flex gap-2 pt-1">
          {editando && (
            <BtnOutline type="button" className="flex-1" onClick={f.cancelarEdicion}>
              Cancelar
            </BtnOutline>
          )}
          <BtnPrimary type="submit" className="flex-1" disabled={f.validating}>
            {f.validating
              ? "Validando..."
              : destValid
                ? editando
                  ? "Revisar y guardar"
                  : "Programar"
                : "Validar y programar"}
          </BtnPrimary>
        </div>
      </form>

      <FrecuentesPickerDialog
        open={f.frecuentesOpen}
        onClose={() => f.setFrecuentesOpen(false)}
        frecuentes={frecuentes}
        onElegir={f.elegirFrecuente}
      />
    </>
  );
}
