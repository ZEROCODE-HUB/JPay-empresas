import { useState } from "react";
import { toast } from "sonner";
import type { LiquidacionesDatos, Ticket } from "@/lib/api/liquidaciones";
import { useIngresarAdelanto } from "@/hooks/useLiquidaciones";
import { addDays, maxMontoAdelanto, montoDelDia, toISO } from "../utils";

export type ActualizarDatos = (fn: (d: LiquidacionesDatos) => LiquidacionesDatos) => void;

/** Formulario "Solicitar adelanto": alta del ticket y actualización en memoria. */
export function useSolicitudAdelanto(datos: LiquidacionesDatos, actualizarDatos: ActualizarDatos) {
  const { dias, disponible, porAcreditar } = datos;
  const ingresarAdelanto = useIngresarAdelanto();
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [fechaAcred, setFechaAcred] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const openGeneral = () => {
    setSelectedDate(null);
    setFechaAcred(dias[0]?.date ?? toISO(addDays(new Date(), 1)));
    setMonto(disponible > 0 ? String(Math.round(disponible)) : "");
    setMotivo("");
    setOpen(true);
  };

  /** Abre el formulario precargado con un día del calendario. */
  const elegirDia = (d: string) => {
    setSelectedDate(d);
    setFechaAcred(d);
    const match = dias.find((x) => x.date === d);
    if (match) setMonto(String(Math.round(match.monto)));
    setMotivo("");
    setOpen(true);
  };

  const crear = async () => {
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
      // Alta con validación server-side (RPC security definer): recalcula el
      // disponible y rechaza si el monto supera el pendiente por acreditar.
      const row = await ingresarAdelanto.mutateAsync({
        monto: montoNum,
        fechaAcreditacion: fechaAcred,
        motivo: motivo || undefined,
      });
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
      actualizarDatos((d) => ({
        ...d,
        tickets: [nuevo, ...d.tickets],
        disponible: Math.max(0, d.disponible - montoNum),
      }));
      setOpen(false);
      toast.success(`Ticket ${nuevo.id} creado — pendiente de aprobación`);
    } catch (e) {
      toast.error((e as Error | null)?.message ?? "No se pudo crear el ticket");
    } finally {
      setSaving(false);
    }
  };

  return {
    open,
    cerrar: () => setOpen(false),
    openGeneral,
    elegirDia,
    selectedDate,
    montoSeleccionado: montoDelDia(selectedDate, dias, porAcreditar),
    maxMonto: maxMontoAdelanto(selectedDate, dias, disponible),
    monto,
    setMonto,
    fechaAcred,
    setFechaAcred,
    motivo,
    setMotivo,
    saving,
    crear,
  };
}

export type SolicitudAdelanto = ReturnType<typeof useSolicitudAdelanto>;
