import { useState } from "react";
import { toast } from "sonner";
import { isPermissionError, toDataError } from "@/lib/supabase";
import { transferirEntreSubcuentas } from "@/lib/api/subcuentas";
import { formatMoney } from "@/shared/format";
import type { Sub } from "../types";
import { parseMonto } from "@/shared/format";
import { esPool } from "../utils";

/** Diálogo "Transferir entre subcuentas" (movimiento interno). */
export function useTransferenciaInterna(subs: Sub[], recargar: () => Promise<void>) {
  const [open, setOpen] = useState(false);
  const [desde, setDesde] = useState("");
  const [hacia, setHacia] = useState("");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [loading, setLoading] = useState(false);

  // Fondeo rápido: abre la transferencia interna con esta subcuenta como
  // destino y la Recaudación (pool) como origen si existe. Si la subcuenta es
  // la Recaudación, se invierte: sale desde el pool.
  const abrirFondeo = (s: Sub) => {
    const pool = subs.find((x) => esPool(x) && x.id !== s.id);
    if (esPool(s)) {
      setDesde(s.id ?? "");
      setHacia("");
    } else {
      setDesde(pool?.id ?? "");
      setHacia(s.id ?? "");
    }
    setMonto("");
    setConcepto("");
    setOpen(true);
  };

  const transferir = async () => {
    if (loading) return;
    const origen = subs.find((x) => x.id === desde);
    const destino = subs.find((x) => x.id === hacia);
    const importe = parseMonto(monto);
    if (!origen?.id || !destino?.id) {
      toast.error("Selecciona las subcuentas de origen y destino");
      return;
    }
    if (desde === hacia) {
      toast.error("Las subcuentas deben ser distintas");
      return;
    }
    if (!Number.isFinite(importe) || importe <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    if (origen.disp < importe) {
      toast.error("Saldo insuficiente en la subcuenta de origen");
      return;
    }
    setLoading(true);
    try {
      await transferirEntreSubcuentas({
        origenId: origen.id,
        destinoId: destino.id,
        monto: importe,
        concepto: concepto || undefined,
      });
      setOpen(false);
      setMonto("");
      setConcepto("");
      toast.success(`Transferencia interna por ${formatMoney(importe)} realizada`);
      await recargar();
    } catch (e) {
      const err = toDataError(e);
      console.error("registrar_transferencia_subcuentas:", err);
      if (isPermissionError(e)) {
        toast.error("Sin permisos para transferir entre estas subcuentas");
      } else {
        toast.error(err.message || "No se pudo realizar la transferencia");
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    open,
    setOpen,
    desde,
    setDesde,
    hacia,
    setHacia,
    monto,
    setMonto,
    concepto,
    setConcepto,
    abrirFondeo,
    transferir,
  };
}
