import { useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useEliminarPuntoVenta, useGuardarPuntoVenta } from "@/hooks/useQr";
import type { EstadoPdv, PuntoVenta } from "@/lib/api/qr";
import { buildQrPdvUrl } from "@/lib/pay-url";

export type FormPdv = { nombre: string; estado: EstadoPdv };

/** Crear/editar, eliminar y ver detalle (con QR) de un punto de venta. */
export function useAccionesPdv(comercioId: string | null) {
  const guardarPdv = useGuardarPuntoVenta();
  const eliminarPdv = useEliminarPuntoVenta();

  const [crearOpen, setCrearOpen] = useState(false);
  // Solo visual: el alta real queda en "Pendiente de aprobación".
  const [form, setForm] = useState<FormPdv>({ nombre: "", estado: "Activado" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detallePd, setDetallePd] = useState<PuntoVenta | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [eliminarOpen, setEliminarOpen] = useState(false);
  const [eliminarId, setEliminarId] = useState<string | null>(null);

  const openCrear = () => {
    setForm({ nombre: "", estado: "Activado" });
    setEditingId(null);
    setCrearOpen(true);
  };

  const openEditar = (p: PuntoVenta) => {
    setForm({ nombre: p.nombre, estado: p.estado });
    setEditingId(p.id);
    setCrearOpen(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!comercioId) {
      toast.error("No se encontró un comercio asociado para este usuario");
      return;
    }
    try {
      await guardarPdv.mutateAsync({
        editingId,
        comercioId,
        nombre: form.nombre.trim(),
        estado: form.estado,
      });
      if (editingId) toast.success("Punto de venta actualizado");
      else toast.success("Punto de venta creado (Pendiente de aprobación — Payway lo activará)");
      setCrearOpen(false);
      setEditingId(null);
    } catch (e) {
      toast.error("No se pudo guardar el punto de venta");
      console.error(e);
    }
  };

  const confirmarEliminar = (id: string) => {
    setEliminarId(id);
    setEliminarOpen(true);
  };

  const ejecutarEliminar = async () => {
    if (!eliminarId) return;
    try {
      await eliminarPdv.mutateAsync(eliminarId);
      toast.success("Punto de venta eliminado");
    } catch (e) {
      toast.error("No se pudo eliminar el punto de venta");
      console.error(e);
    } finally {
      setEliminarOpen(false);
      setEliminarId(null);
    }
  };

  const verDetalle = async (p: PuntoVenta) => {
    setDetallePd(p);
    setDetalleOpen(true);
    try {
      const url = buildQrPdvUrl(p.id);
      const qr = await QRCode.toDataURL(url, { width: 280, margin: 2 });
      setQrDataUrl(qr);
    } catch {
      setQrDataUrl("");
    }
  };

  return {
    crearOpen,
    setCrearOpen,
    form,
    setForm,
    editingId,
    openCrear,
    openEditar,
    guardar,
    detalleOpen,
    setDetalleOpen,
    detallePd,
    qrDataUrl,
    verDetalle,
    eliminarOpen,
    setEliminarOpen,
    confirmarEliminar,
    ejecutarEliminar,
  };
}
