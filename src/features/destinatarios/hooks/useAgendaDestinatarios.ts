import { useMemo, useState } from "react";
import { toast } from "sonner";
import { toDataError } from "@/lib/supabase";
import { deleteFrequentRecipient } from "@/lib/api/transferencias";
import { useDestinatariosFrecuentes } from "@/hooks/useTransferencias";
import {
  filtrarDestinatarios,
  ordenarDestinatarios,
  type OrdenDestinatarios,
} from "@/features/transferencias/utils";
import { aDestinatario, type Destinatario } from "../utils";

/** Agenda real con búsqueda, orden y baja de destinatarios. */
export function useAgendaDestinatarios() {
  const {
    frecuentes,
    cargando,
    setFrecuentes,
    recargar: cargarDestinatarios,
  } = useDestinatariosFrecuentes();
  const items = useMemo(() => frecuentes.map(aDestinatario), [frecuentes]);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<OrdenDestinatarios>("recientes");
  // Filtro por nombre/alias/CBU y orden sobre la agenda real.
  const visibles = useMemo(
    () =>
      ordenarDestinatarios(filtrarDestinatarios(frecuentes, busqueda), orden).map(aDestinatario),
    [frecuentes, busqueda, orden],
  );
  const [eliminar, setEliminar] = useState<Destinatario | null>(null);

  const confirmarEliminar = async () => {
    const d = eliminar;
    setEliminar(null);
    if (!d) return;
    try {
      await deleteFrequentRecipient(d.id);
      setFrecuentes((prev) => prev.filter((x) => x.id !== d.id));
      toast.success("Destinatario eliminado de la agenda");
    } catch (e) {
      toast.error(toDataError(e).message);
    }
  };

  return {
    hayAgenda: frecuentes.length > 0,
    cargando,
    cargarDestinatarios,
    items,
    visibles,
    busqueda,
    setBusqueda,
    orden,
    setOrden,
    eliminar,
    setEliminar,
    confirmarEliminar,
  };
}

export type AgendaDestinatarios = ReturnType<typeof useAgendaDestinatarios>;
