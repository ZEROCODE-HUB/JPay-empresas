import { useEffect, useState } from "react";
import { toast } from "sonner";
import { toDataError, isPermissionError } from "@/lib/supabase";
import { executeTransfer } from "@/lib/transfer-orchestrator";
import { useSubcuentasOrigen } from "@/hooks/useTransferencias";
import type { Destinatario } from "../utils";

/** Transferencia rápida a un destinatario de la agenda. */
export function useTransferirDestinatario() {
  const [transferir, setTransferir] = useState<Destinatario | null>(null);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [subcuentaOrigen, setSubcuentaOrigen] = useState("");
  const [sending, setSending] = useState(false);
  const { subcuentas, recargar: recargarSubcuentas } = useSubcuentasOrigen();

  // Al cargar (o recargar) las subcuentas se preselecciona la primera.
  const primeraSubcuenta = subcuentas[0]?.id;
  useEffect(() => {
    if (primeraSubcuenta) setSubcuentaOrigen(primeraSubcuenta);
  }, [primeraSubcuenta]);

  const cargarSubcuentas = async () => {
    const lista = await recargarSubcuentas();
    if (lista && lista.length > 0) setSubcuentaOrigen(lista[0].id);
  };

  const abrir = (d: Destinatario) => {
    setTransferir(d);
    setMonto("");
    setConcepto("");
  };

  const handleTransferir = async () => {
    if (!transferir || !subcuentaOrigen || !monto) return;
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      toast.error("Ingresa un monto valido");
      return;
    }
    setSending(true);
    try {
      // Destinatario frecuente → validación desacoplada → ejecución → movimiento
      const res = await executeTransfer({
        subcuentaOrigenId: subcuentaOrigen,
        destinatarioIdentifier: transferir.cbu,
        monto: montoNum,
        concepto: concepto || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Validación fallida");
        return;
      }
      toast.success(`Transferencia enviada — TXID: ${res.txn.id_txn}`);
      setTransferir(null);
      setMonto("");
      setConcepto("");
      await cargarSubcuentas();
    } catch (e) {
      const err = toDataError(e);
      if (isPermissionError(e)) {
        toast.error("Sin permisos para realizar esta transferencia");
      } else {
        toast.error(err.message || "No se pudo enviar la transferencia");
      }
    } finally {
      setSending(false);
    }
  };

  return {
    transferir,
    setTransferir,
    abrir,
    monto,
    setMonto,
    concepto,
    setConcepto,
    subcuentaOrigen,
    setSubcuentaOrigen,
    subcuentas,
    sending,
    handleTransferir,
  };
}

export type TransferirDestinatario = ReturnType<typeof useTransferirDestinatario>;
