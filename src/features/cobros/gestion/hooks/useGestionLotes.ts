import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { eliminarLoteDB, getLotesGestionDB, type LoteEstado } from "@/lib/api/cobros-masivos";
import { filtrarLotes, paginar, totalPaginas } from "../../utils";

const SIN_LOTES: Awaited<ReturnType<typeof getLotesGestionDB>> = [];

/** Listado de gestión de lotes: carga, filtros, paginación y eliminación. */
export function useGestionLotes() {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<LoteEstado | "todos">("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [confirmarEliminarId, setConfirmarEliminarId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["cobros", "lotes-gestion"],
    queryFn: getLotesGestionDB,
    meta: { silencioso: true },
  });
  const lotesData = q.data ?? SIN_LOTES;

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

  const recargar = () => void q.refetch();

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
    isLoading: q.isPending,
    error: q.isError && !q.data ? q.error : null,
    confirmarEliminarId,
    setConfirmarEliminarId,
    eliminar,
  };
}
