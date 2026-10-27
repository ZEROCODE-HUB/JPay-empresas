import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { eliminarLoteDB, getLotesGestionDB, type LoteEstado } from "@/lib/api/cobros-masivos";
import { filtrarLotes, paginar, totalPaginas } from "../../utils";

/** Listado de gestión de lotes: carga, filtros, paginación y eliminación. */
export function useGestionLotes() {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<LoteEstado | "todos">("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [confirmarEliminarId, setConfirmarEliminarId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [lotesData, setLotesData] = useState<Awaited<ReturnType<typeof getLotesGestionDB>>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getLotesGestionDB();
      if (!cancelled) setLotesData(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const lotes = useMemo(
    () =>
      filtrarLotes(lotesData, {
        busqueda,
        estado: filtroEstado,
        desde: fechaDesde,
        hasta: fechaHasta,
      }),
    [lotesData, busqueda, filtroEstado, fechaDesde, fechaHasta],
  );

  useEffect(() => {
    setPage(1);
  }, [busqueda, filtroEstado, fechaDesde, fechaHasta]);

  const recargar = () => setTick((t) => t + 1);

  /** Elimina el lote pendiente de confirmación; `onOk` corre si salió bien. */
  const eliminar = async (onOk: () => void) => {
    if (confirmarEliminarId === null) return;
    const result = await eliminarLoteDB(confirmarEliminarId);
    if (result.ok) {
      toast.success("Lote eliminado");
      onOk();
      recargar();
    } else {
      toast.error(result.error ?? "No se pudo eliminar");
    }
  };

  return {
    filtros: {
      busqueda,
      setBusqueda,
      filtroEstado,
      setFiltroEstado,
      fechaDesde,
      setFechaDesde,
      fechaHasta,
      setFechaHasta,
    },
    lotes,
    paginados: paginar(lotes, page, pageSize),
    page,
    setPage,
    pageSize,
    cambiarPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    totalPages: totalPaginas(lotes.length, pageSize),
    recargar,
    confirmarEliminarId,
    setConfirmarEliminarId,
    eliminar,
  };
}
