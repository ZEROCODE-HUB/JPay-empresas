import { useState } from "react";
import { toast } from "sonner";
import type { Ticket, TicketEstado } from "@/lib/api/liquidaciones";
import { useCancelarAdelanto } from "@/hooks/useLiquidaciones";
import type { ActualizarDatos } from "./useSolicitudAdelanto";

/** Ticket abierto en el modal de detalle y su cancelación. */
export function useDetalleTicket(actualizarDatos: ActualizarDatos) {
  const cancelarAdelanto = useCancelarAdelanto();
  const [detalle, setDetalle] = useState<Ticket | null>(null);
  const [saving, setSaving] = useState(false);

  const cancelar = async (adelantoId?: string) => {
    if (!adelantoId) {
      toast.error("No se pudo identificar el adelantar");
      return;
    }
    setSaving(true);
    try {
      const row = await cancelarAdelanto.mutateAsync(adelantoId);
      const estado = (row?.estado ?? "cancelado").toLowerCase() as TicketEstado;
      actualizarDatos((d) => ({
        ...d,
        tickets: d.tickets.map((t) => (t.fullId === adelantoId ? { ...t, estado } : t)),
      }));
      setDetalle((prev) => (prev && prev.fullId === adelantoId ? { ...prev, estado } : null));
      toast.success("Adelanto cancelado correctamente");
    } catch (e) {
      toast.error((e as Error | null)?.message ?? "No se pudo cancelar el adelantar");
    } finally {
      setSaving(false);
    }
  };

  return { detalle, setDetalle, saving, cancelar };
}
