import { useState } from "react";
import { toast } from "sonner";
import { deleteSubcuenta, setEstadoSubcuenta } from "@/lib/api/subcuentas";
import type { EstadoSub, Sub } from "../types";

/** Detalle abierto, pausa/reactivación y eliminación de subcuentas. */
export function useAccionesSubcuenta(setSubs: (fn: (prev: Sub[]) => Sub[]) => void) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [detailSub, setDetailSub] = useState<Sub | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<Sub | null>(null);

  const borrar = async () => {
    if (!confirmarBorrar?.id) return;
    try {
      await deleteSubcuenta(confirmarBorrar.id);
      setSubs((prev) => prev.filter((x) => x.id !== confirmarBorrar.id));
      toast.success("Subcuenta eliminada");
    } catch {
      toast.error("No se pudo eliminar la subcuenta");
    } finally {
      setConfirmarBorrar(null);
    }
  };

  const cambiarEstado = async (id: string, estado: EstadoSub) => {
    try {
      await setEstadoSubcuenta(id, estado);
      setSubs((prev) => prev.map((x) => (x.id === id ? { ...x, e: estado } : x)));
      if (detailSub?.id === id) setDetailSub((d) => (d ? { ...d, e: estado } : d));
      toast.success(estado === "Activa" ? "Subcuenta reactivada" : "Subcuenta pausada");
    } catch {
      toast.error("No se pudo actualizar el estado");
    }
  };

  return {
    menuId,
    setMenuId,
    detailSub,
    setDetailSub,
    confirmarBorrar,
    setConfirmarBorrar,
    borrar,
    cambiarEstado,
  };
}
