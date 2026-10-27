import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { toDataError } from "@/lib/supabase";
import { detectIdentifierKind, type RecipientValidationResult } from "@/lib/recipient-validation";
import { validateRecipient } from "@/lib/recipient-bdc";
import {
  type FrequentRecipient,
  type Scheduled,
  type Template,
  createScheduledTransfer,
  updateScheduledTransfer,
} from "@/lib/api/transferencias";
import type { Subcuenta } from "../types";
import { CONCEPTO_DEFAULT, validacionGuardada } from "../utils";

export type ProgramarProps = {
  subcuentas: Subcuenta[];
  onSuccess: (s: Scheduled) => void | Promise<void>;
  template?: Template | null;
  onClearTemplate?: () => void;
  /** When provided, this scheduled transfer is being EDITED instead of created. */
  programada?: Scheduled | null;
  /** Leaves edit mode (goes back to the scheduled list). */
  onCancelarEdicion?: () => void;
};

/** Formulario "Programar" (alta o edición de una transferencia programada). */
export function useProgramar({
  subcuentas,
  onSuccess,
  template,
  onClearTemplate,
  programada,
  onCancelarEdicion,
}: ProgramarProps) {
  const editando = Boolean(programada);
  const [confirm, setConfirm] = useState(false);
  const [frecuentesOpen, setFrecuentesOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [destQuery, setDestQuery] = useState("");
  const [destValid, setDestValid] = useState<RecipientValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [subcuentaOrigen, setSubcuentaOrigen] = useState(subcuentas[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("14:30");
  const [concepto, setConcepto] = useState(CONCEPTO_DEFAULT);

  // Sync the default subaccount once they load asynchronously.
  useEffect(() => {
    if (subcuentas.length > 0 && !subcuentaOrigen) setSubcuentaOrigen(subcuentas[0].id);
  }, [subcuentas, subcuentaOrigen]);

  // Template picked: prefills recipient (left to validate), amount,
  // concept and subaccount. After the effect above so this one wins.
  useEffect(() => {
    if (!template) return;
    setDestQuery(template.destinatario?.cbu ?? "");
    setDestValid(null);
    if (template.monto != null) setMonto(String(template.monto));
    if (template.concepto) setConcepto(template.concepto);
    if (template.subcuentaOrigen) setSubcuentaOrigen(template.subcuentaOrigen);
    onClearTemplate?.();
  }, [template, onClearTemplate]);

  // Editing a scheduled transfer: it loads into this same form (like drafts and
  // frequent recipients). The recipient was already validated, so it is prefilled
  // as valid and the API is not queried again.
  //
  // The ref avoids re-applying the prefill on every render (it would overwrite
  // what the user is typing). It resets when edit mode ends.
  const programadaAplicada = useRef<string | null>(null);
  useEffect(() => {
    if (!programada) {
      programadaAplicada.current = null;
      return;
    }
    if (programadaAplicada.current === programada.id) return;
    programadaAplicada.current = programada.id;

    const p = programada;
    const cbu = p.cbu ?? "";
    setDestQuery(cbu);
    setDestValid(
      cbu
        ? validacionGuardada(cbu, {
            nombre: p.destinatario,
            cuit: p.cuit ?? "",
            alias: p.alias ?? "",
            banco: p.banco,
          })
        : null,
    );
    setMonto(p.montoNum ? String(p.montoNum) : "");
    setFecha(p.fechaISO ?? "");
    if (p.hora) setHora(p.hora);
    if (p.concepto) setConcepto(p.concepto);
    if (p.subcuentaOrigen) setSubcuentaOrigen(p.subcuentaOrigen);
    setConfirm(false);
  }, [programada]);

  const handleValidate = async (identifier?: string): Promise<RecipientValidationResult | null> => {
    const q = (identifier ?? destQuery).trim();
    if (!q) {
      toast.error("Ingresa un CBU/CVU o Alias");
      return null;
    }
    setValidating(true);
    try {
      const res = await validateRecipient(q, detectIdentifierKind(q));
      if (res.ok) {
        setDestValid(res);
        return res;
      } else {
        setDestValid(null);
        toast.error(res.errorMessage ?? "Destinatario no válido");
        return null;
      }
    } catch {
      toast.error("Error validando destinatario");
      return null;
    } finally {
      setValidating(false);
    }
  };

  const cambiarDestino = (v: string) => {
    setDestQuery(v);
    setDestValid(null);
  };

  /** Se muestra ya lo guardado y se revalida contra el banco (detalle completo). */
  const elegirFrecuente = (f: FrequentRecipient) => {
    const cbu = f.cbu;
    setDestQuery(cbu);
    setDestValid(
      validacionGuardada(cbu, { nombre: f.nombre, cuit: f.cuit, alias: f.alias, banco: f.banco }),
    );
    setFrecuentesOpen(false);
    void handleValidate(cbu);
  };

  /** Submit del formulario: valida (o revalida) y pasa a la confirmación. */
  const revisar = async (e: FormEvent) => {
    e.preventDefault();
    let valid = destValid;
    if (!valid) {
      valid = await handleValidate();
      if (!valid) return;
    }
    // re-validar si el query cambió después de validar
    if (valid.identifier !== destQuery.trim()) {
      valid = await handleValidate();
      if (!valid) return;
    }
    // asegurar monto válido antes de confirmar
    if (!monto || Number(monto) <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    setConfirm(true);
  };

  /** Guarda la programada (alta o edición). */
  const guardar = async () => {
    if (guardando || !destValid) return;
    setGuardando(true);
    try {
      // Se persiste ANTES de mostrarla en la lista: si falla, no se
      // "guarda" nada y el usuario lo ve en el toast.
      const datos = {
        destinatario: {
          nombre: destValid.titular?.nombre ?? destValid.identifier,
          alias: destValid.titular?.alias,
          cbu: destValid.titular?.cbu ?? destValid.identifier,
          cuit: destValid.titular?.cuit,
          banco: destValid.titular?.banco,
        },
        subcuentaOrigen,
        monto: Number(monto) || 0,
        concepto,
        fechaEnvio: fecha || new Date().toISOString().slice(0, 10),
        horaEnvio: hora,
      };
      // Editing: overwrites the existing scheduled transfer. Otherwise creates a new one.
      const fila = programada
        ? await updateScheduledTransfer(programada.id, datos)
        : await createScheduledTransfer(datos);
      await onSuccess(fila);
    } catch (e) {
      toast.error(toDataError(e).message);
    } finally {
      setGuardando(false);
    }
  };

  const cancelarEdicion = () => {
    onCancelarEdicion?.();
    setConfirm(false);
  };

  return {
    editando,
    confirm,
    setConfirm,
    frecuentesOpen,
    setFrecuentesOpen,
    guardando,
    destQuery,
    cambiarDestino,
    destValid,
    validating,
    handleValidate,
    elegirFrecuente,
    subcuentaOrigen,
    setSubcuentaOrigen,
    monto,
    setMonto,
    fecha,
    setFecha,
    hora,
    setHora,
    concepto,
    setConcepto,
    revisar,
    guardar,
    cancelarEdicion,
  };
}
