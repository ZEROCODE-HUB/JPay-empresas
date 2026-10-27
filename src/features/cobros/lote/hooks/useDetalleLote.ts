import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  eliminarLoteDB,
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

/** Carga del lote + registros y acciones de la pantalla de detalle de un lote. */
export function useDetalleLote(id: string) {
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [lote, setLote] = useState<Lote | null>(null);
  const [registros, setRegistros] = useState<RegistroDeLote[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [generandoLinks, setGenerandoLinks] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCargando(true);
      setErrorCarga(null);
      try {
        const [l, r] = await Promise.all([getLoteByIdDB(id), getRegistrosByLoteIdDB(id)]);
        if (!cancelled) {
          setLote(l);
          setRegistros(r);
        }
      } catch (e) {
        if (!cancelled) setErrorCarga(String(e));
      } finally {
        if (!cancelled) setCargando(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, refresh]);

  const trigger = () => setRefresh((r) => r + 1);

  const generarLinks = async (force: boolean) => {
    const legajo = await getLegajoUsuario();
    if (!legajo) {
      toast.error("No se pudo identificar el usuario");
      return;
    }
    setGenerandoLinks(true);
    try {
      const result = await iniciarLoteDB(id, legajo, force);
      if (result.ok) {
        toast.success(
          force
            ? `${result.linksCount} links regenerados`
            : `Lote iniciado - ${result.linksCount} links de pago creados`,
        );
        trigger();
      } else {
        toast.error(
          result.error ??
            (force ? "No se pudieron regenerar los links" : "El lote no esta en estado pendiente"),
        );
      }
    } finally {
      setGenerandoLinks(false);
    }
  };

  const handlers: HandlersLote = {
    onIniciar: () => generarLinks(false),
    onRegenerarLinks: () => generarLinks(true),
    onPausar: async () => {
      const result = await pausarLoteDB(id);
      if (result.ok) {
        toast.success("Lote pausado");
        trigger();
      } else toast.error(result.error ?? "No se pudo pausar el lote");
    },
    onReanudar: async () => {
      const result = await reanudarLoteDB(id);
      if (result.ok) {
        toast.success("Lote reanudado");
        trigger();
      } else toast.error(result.error ?? "No se pudo reanudar el lote");
    },
    onEliminar: () => setConfirmarEliminar(true),
  };

  const eliminar = async () => {
    const result = await eliminarLoteDB(id);
    if (result.ok) {
      toast.success("Lote eliminado");
      navigate({ to: "/app/cobros/gestion" });
    }
  };

  const copiarLink = (url: string) => {
    // Resoluble real usando @/lib/pay-url (VITE_APP_URL > window.location.origin).
    navigator.clipboard.writeText(linkParaCopiar(url));
    toast.success("Link copiado al portapapeles");
  };

  const exportar = () => {
    if (!lote) return;
    exportarRegistrosExcel(
      registros,
      `cobros-lote-${lote.id}-${lote.nombre.replace(/\s/g, "-")}.xlsx`,
      true,
    );
  };

  return {
    lote,
    registros,
    cargando,
    errorCarga,
    generandoLinks,
    handlers,
    confirmarEliminar,
    setConfirmarEliminar,
    eliminar,
    copiarLink,
    exportar,
    volver: () => navigate({ to: "/app/cobros/gestion" }),
  };
}
