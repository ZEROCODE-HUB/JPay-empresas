import { useState } from "react";
import { toast } from "sonner";
import {
  getLegajoUsuario,
  getLoteByIdDB,
  getRegistrosByLoteIdDB,
  iniciarLoteDB,
  pausarLoteDB,
  reanudarLoteDB,
  type Lote,
  type RegistroDeLote,
} from "@/lib/api/cobros-masivos";
import type { HandlersLote } from "../../components/AccionesLote";
import { exportarRegistrosExcel } from "../../export";
import { linkParaCopiar } from "../../utils";

/**
 * Modal de detalle de un lote dentro de gestión.
 * `recargarLista` refresca la tabla de gestión; `pedirEliminar` abre la confirmación.
 */
export function useDetalleLoteModal(
  recargarLista: () => void,
  pedirEliminar: (id: string) => void,
) {
  const [lote, setLote] = useState<Lote | null>(null);
  const [open, setOpen] = useState(false);
  const [registros, setRegistros] = useState<RegistroDeLote[]>([]);
  const [generandoLinks, setGenerandoLinks] = useState(false);

  const abrir = async (id: string) => {
    const l = await getLoteByIdDB(id);
    if (l) {
      setLote(l);
      const regs = await getRegistrosByLoteIdDB(id);
      setRegistros(regs);
      setOpen(true);
    }
  };

  const cerrarYLimpiar = () => {
    setOpen(false);
    setLote(null);
  };

  const refrescarLote = async (id: string) => {
    const fresh = await getLoteByIdDB(id);
    if (fresh) setLote(fresh);
  };

  const generarLinks = async (id: string, force: boolean) => {
    const legajo = await getLegajoUsuario();
    if (!legajo) {
      toast.error("No se pudo identificar el usuario");
      return;
    }
    setGenerandoLinks(true);
    try {
      const result = await iniciarLoteDB(id, legajo, force);
      if (!result.ok) {
        toast.error(
          result.error ??
            (force ? "No se pudieron regenerar los links" : "No se pudo iniciar el lote"),
        );
        return;
      }
      toast.success(
        force
          ? `${result.linksCount} links regenerados`
          : `Lote iniciado - ${result.linksCount} links de pago creados`,
      );
      await refrescarLote(id);
      const freshRegs = await getRegistrosByLoteIdDB(id);
      setRegistros(freshRegs);
      recargarLista();
    } finally {
      setGenerandoLinks(false);
    }
  };

  const handlersPara = (id: string): HandlersLote => ({
    onIniciar: () => generarLinks(id, false),
    onRegenerarLinks: () => generarLinks(id, true),
    onPausar: async () => {
      const result = await pausarLoteDB(id);
      if (result.ok) {
        toast.success("Lote pausado");
        await refrescarLote(id);
      } else {
        toast.error(result.error ?? "No se pudo pausar el lote");
      }
    },
    onReanudar: async () => {
      const result = await reanudarLoteDB(id);
      if (result.ok) {
        toast.success("Lote reanudado");
        await refrescarLote(id);
      } else {
        toast.error(result.error ?? "No se pudo reanudar el lote");
      }
    },
    onEliminar: () => pedirEliminar(id),
  });

  const copiarLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(linkParaCopiar(url));
      toast.success("Link copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el link y copialo manualmente.");
    }
  };

  const exportar = () => {
    if (lote) exportarRegistrosExcel(registros, `cobros-lote-${lote.id}.xlsx`, false);
  };

  return {
    lote: open ? lote : null,
    registros,
    generandoLinks,
    handlers: lote ? handlersPara(lote.id) : null,
    abrir,
    cerrar: () => setOpen(false),
    cerrarYLimpiar,
    copiarLink,
    exportar,
  };
}
