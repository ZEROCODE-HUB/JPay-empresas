import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { detectIdentifierKind } from "@/lib/recipient-validation";
import { validateRecipient } from "@/lib/recipient-bdc";
import { useCotizacion } from "./useCotizacion";
import { formatDate, formatMoney } from "@/shared/format";
import type { Draft, FrequentRecipient, Template } from "@/lib/api/transferencias";
import type { CoelsaResult, Subcuenta, TransferPayload } from "../types";
import { CONCEPTO_DEFAULT, mensajeValidacionFallida, titularACoelsa } from "../utils";

export type TransferenciaUnicaProps = {
  setConfirm: (v: boolean) => void;
  onOtpRequired: (payload: TransferPayload) => void | Promise<void>;
  subcuentas: Subcuenta[];
  onTransferPayload: (p: TransferPayload) => void;
  onSaveDraft: (d: Draft) => void | Promise<void>;
  prefilledDestinatario?: CoelsaResult;
  onClearPrefill?: () => void;
  template?: Template | null;
  onClearTemplate?: () => void;
};

/**
 * Formulario de transferencia única: validación del destinatario contra el
 * banco, cotización en vivo (monto + comisión + IVA vs. disponible), borrador y
 * armado del payload que se confirma.
 */
export function useTransferenciaUnica({
  setConfirm,
  onOtpRequired,
  subcuentas,
  onTransferPayload,
  onSaveDraft,
  prefilledDestinatario,
  onClearPrefill,
  template,
  onClearTemplate,
}: TransferenciaUnicaProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectedDestinatario, setSelectedDestinatario] = useState<CoelsaResult | null>(
    () => prefilledDestinatario ?? null,
  );
  const [frecuentesOpen, setFrecuentesOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const [subcuentaOrigen, setSubcuentaOrigen] = useState("");
  const [concepto, setConcepto] = useState(CONCEPTO_DEFAULT);

  useEffect(() => {
    if (subcuentas.length > 0 && !subcuentaOrigen) {
      setSubcuentaOrigen(subcuentas[0].id);
    }
  }, [subcuentas, subcuentaOrigen]);

  useEffect(() => {
    if (prefilledDestinatario) {
      onClearPrefill?.();
      setSearchQuery(prefilledDestinatario.cbu);
      setSelectedDestinatario(prefilledDestinatario);
      // El frecuente guarda solo nombre/CUIT/CBU/alias: se revalida contra el banco
      // para traer el resto del detalle (banco, tipo de cuenta, moneda, estado) sin
      // que haya que apretar "Validar".
      void handleSearch(prefilledDestinatario.cbu);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSearch se recrea en cada render
  }, [prefilledDestinatario, onClearPrefill]);

  // Template picked in the dialog: prefills recipient, amount, concept and subaccount.
  // Declared AFTER the effect that sets the first subaccount, so this one wins.
  useEffect(() => {
    if (!template) return;
    const d = template.destinatario;
    if (d?.cbu) {
      setSearchQuery(d.cbu);
      setSelectedDestinatario({
        nombre: d.nombre,
        cuit: d.cuit ?? "",
        cbu: d.cbu,
        alias: d.alias ?? "",
      });
      // Misma idea que con los frecuentes: revalidar para tener el detalle del banco.
      void handleSearch(d.cbu);
    }
    // Generic template (e.g. "Sueldos"): the recipient is NOT touched. If one is already
    // picked it is kept; otherwise the user searches for each person.
    if (template.monto != null) setMonto(String(template.monto));
    if (template.concepto) setConcepto(template.concepto);
    if (template.subcuentaOrigen) setSubcuentaOrigen(template.subcuentaOrigen);
    onClearTemplate?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSearch se recrea en cada render
  }, [template, onClearTemplate]);

  /** Validates the recipient typed in the field. Returns the holder or null. */
  const handleSearch = async (identifier?: string): Promise<CoelsaResult | null> => {
    const q = (identifier ?? searchQuery).trim();
    if (!q) {
      toast.error("Ingresa el CBU/CVU o alias del destinatario");
      return null;
    }
    setSearching(true);
    try {
      const res = await validateRecipient(q, detectIdentifierKind(q));
      if (res.ok && res.titular) {
        onClearPrefill?.();
        const titular = titularACoelsa(res.titular);
        setSelectedDestinatario(titular);
        if (res.provider === "bdc") {
          toast.success("Titular verificado por Banco de Comercio");
        }
        return titular;
      }
      toast.error(mensajeValidacionFallida(res));
      return null;
    } catch {
      toast.error("Error validando destinatario");
      return null;
    } finally {
      setSearching(false);
    }
  };

  const saveAsDraft = async () => {
    // Mismo criterio que "Continuar": si el destinatario no esta validado se
    // valida aca (antes hacia un return silencioso y parecia que no guardaba).
    const dest = selectedDestinatario ?? (await handleSearch());
    if (!dest) return;

    const amount = Number(monto) || 0;
    if (!amount || amount <= 0) {
      toast.error("Ingresa un monto valido para guardar el borrador");
      return;
    }
    if (!subcuentaOrigen) {
      toast.error("Selecciona una subcuenta de origen");
      return;
    }

    // The draft is persisted in `transferencias_borrador` (via lib/api/transferencias);
    // here the row is only assembled. It creates no movement: when executed it goes
    // through validation -> execution -> movement.
    await onSaveDraft({
      id: `d${Date.now()}`,
      destinatario: dest.nombre,
      alias: dest.alias,
      cbu: dest.cbu,
      cuit: dest.cuit,
      subcuentaOrigen,
      montoNum: amount,
      monto: formatMoney(amount),
      concepto,
      ref: "",
      fecha: formatDate(new Date()),
    });
  };

  /** Vuelve el formulario a cero (para salir sin guardar nada). */
  const resetForm = () => {
    setSelectedDestinatario(null);
    setSearchQuery("");
    setMonto("");
    setConcepto(CONCEPTO_DEFAULT);
    setConfirm(false);
    toast.success("Formulario limpiado");
  };

  /** Texto del destinatario editado: la validación anterior deja de valer. */
  const cambiarBusqueda = (v: string) => {
    setSearchQuery(v);
    setSelectedDestinatario(null);
  };

  /** Elegido de la lista de frecuentes: se muestra y se revalida contra el banco. */
  const elegirFrecuente = (f: FrequentRecipient) => {
    onClearPrefill?.();
    setSearchQuery(f.cbu);
    setSelectedDestinatario({
      nombre: f.nombre,
      cuit: f.cuit,
      cbu: f.cbu,
      alias: f.alias,
    });
    setFrecuentesOpen(false);
    // Se revalida contra el banco para completar la ficha (banco, tipo
    // de cuenta, moneda, estado) sin tener que apretar "Validar".
    void handleSearch(f.cbu);
  };

  const subcuentaSeleccionada = subcuentas.find((s) => s.id === subcuentaOrigen);
  const montoNumero = Number(monto) || 0;
  const disponibleOrigen = Number(subcuentaSeleccionada?.saldo_disponible ?? 0);
  // Validacion en tiempo real: monto + comision + IVA contra el disponible del origen.
  const cot = useCotizacion(
    subcuentaOrigen,
    montoNumero,
    selectedDestinatario?.cbu ?? null,
    disponibleOrigen,
  );

  /** "Continuar": valida destinatario y monto y pasa a la pantalla de confirmación. */
  const continuar = async (e: FormEvent) => {
    e.preventDefault();
    // If the recipient is not validated (or the text changed), validate here
    // before moving on to the confirmation screen.
    if (!selectedDestinatario) {
      if (!(await handleSearch())) return;
    }
    if (!monto || Number(monto) <= 0) {
      toast.error("Ingresa un monto valido");
      return;
    }
    if (cot.insuficiente) {
      toast.error("Saldo insuficiente en la subcuenta de origen");
      return;
    }
    setConfirm(true);
  };

  /** "Confirmar transferencia": arma el payload y lo entrega (OTP o envío directo). */
  const confirmar = async () => {
    const montoNum = montoNumero;
    if (!subcuentaOrigen) {
      toast.error("Selecciona una subcuenta de origen");
      return;
    }
    if (!selectedDestinatario) {
      toast.error("Falta destinatario validado");
      return;
    }
    if (!montoNum || montoNum <= 0) {
      toast.error("Ingresa un monto válido mayor a 0");
      return;
    }
    if (cot.insuficiente) {
      toast.error("Saldo insuficiente en la subcuenta de origen");
      return;
    }
    const payload: TransferPayload = {
      subcuentaOrigen,
      destinatarioCbu: selectedDestinatario.cbu,
      destinatarioCuit: selectedDestinatario.cuit,
      destinatarioNombre: selectedDestinatario.nombre,
      destinatarioAlias: selectedDestinatario.alias,
      destinatario: selectedDestinatario,
      monto: montoNum,
      concepto,
    };
    onTransferPayload(payload);
    await onOtpRequired(payload);
  };

  return {
    searchQuery,
    cambiarBusqueda,
    searching,
    handleSearch,
    selectedDestinatario,
    frecuentesOpen,
    setFrecuentesOpen,
    elegirFrecuente,
    monto,
    setMonto,
    montoNumero,
    subcuentaOrigen,
    setSubcuentaOrigen,
    subcuentaSeleccionada,
    disponibleOrigen,
    concepto,
    setConcepto,
    cot,
    saveAsDraft,
    resetForm,
    continuar,
    confirmar,
  };
}
