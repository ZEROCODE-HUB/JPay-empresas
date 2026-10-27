import { useState } from "react";
import { toast } from "sonner";
import { getOperacion } from "@/lib/api/movimientos";
import { descargarComprobantePdf } from "@/lib/comprobante-pdf";
import { compartirComprobante } from "@/lib/comprobante-imagen";
import {
  comprobanteDeMov,
  movDeOperacion,
  type ClienteComprobante,
  type Linea,
  type Mov,
} from "../utils";

/** Detalle de una operación y descarga/compartir de su comprobante. */
export function useComprobanteMovimiento(cliente: ClienteComprobante) {
  const [detalle, setDetalle] = useState<Mov | null>(null);

  /** Operacion completa de una linea (detalle y comprobante). */
  const cargarOperacion = async (l: Linea): Promise<Mov | null> => {
    try {
      return movDeOperacion(await getOperacion(l.transactionId));
    } catch {
      toast.error("No se pudo cargar la operación");
      return null;
    }
  };

  const descargarMov = (m: Mov) => {
    descargarComprobantePdf(comprobanteDeMov(m, cliente));
    toast.success("Comprobante descargado");
  };

  const compartirMov = async (m: Mov) => {
    const res = await compartirComprobante(comprobanteDeMov(m, cliente));
    if (res === "compartido") toast.success("Comprobante compartido");
    else if (res === "descargado")
      toast.info("Tu navegador no comparte archivos: se descargó el comprobante para adjuntarlo.");
    else if (res === "error") toast.error("No se pudo compartir el comprobante");
  };

  const verDetalle = async (l: Linea) => {
    const m = await cargarOperacion(l);
    if (m) setDetalle(m);
  };

  const descargar = async (l: Linea) => {
    const m = await cargarOperacion(l);
    if (!m) return;
    descargarMov(m);
  };

  const compartir = async (l: Linea) => {
    const m = await cargarOperacion(l);
    if (!m) return;
    await compartirMov(m);
  };

  return {
    detalle,
    cerrarDetalle: () => setDetalle(null),
    verDetalle,
    descargar,
    compartir,
    descargarMov,
    compartirMov,
  };
}
