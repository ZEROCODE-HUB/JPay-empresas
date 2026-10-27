import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";
import { BtnOutline, BtnPrimary } from "@/components/portal-shell";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { descargarPlantilla, exportarLotesExcel, exportarLotesPdf } from "@/features/cobros/export";
import { DetalleLoteModal } from "@/features/cobros/gestion/components/DetalleLoteModal";
import { GestionFiltros } from "@/features/cobros/gestion/components/GestionFiltros";
import { GestionPaginacion } from "@/features/cobros/gestion/components/GestionPaginacion";
import { LotesTabla } from "@/features/cobros/gestion/components/LotesTabla";
import { useDetalleLoteModal } from "@/features/cobros/gestion/hooks/useDetalleLoteModal";
import { useGestionLotes } from "@/features/cobros/gestion/hooks/useGestionLotes";

export const Route = createFileRoute("/app/cobros/gestion")({ component: GestionLotes });

function GestionLotes() {
  const navigate = useNavigate();
  const g = useGestionLotes();
  const detalle = useDetalleLoteModal(g.recargar, g.setConfirmarEliminarId);

  return (
    <>
      {/* Acciones globales */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <BtnPrimary
          className="h-9 px-3 text-xs"
          onClick={() => navigate({ to: "/app/cobros/nuevo" })}
        >
          <Plus size={14} /> Nuevo lote
        </BtnPrimary>
        <BtnOutline
          className="h-9 px-3 text-xs"
          onClick={() => {
            descargarPlantilla("gestion");
            toast.success("Plantilla descargada");
          }}
        >
          <Download size={14} /> Descargar plantilla
        </BtnOutline>
        <BtnOutline className="h-9 px-3 text-xs" onClick={() => exportarLotesExcel(g.lotes)}>
          <FileSpreadsheet size={14} /> Excel
        </BtnOutline>
        <BtnOutline className="h-9 px-3 text-xs" onClick={() => exportarLotesPdf(g.lotes)}>
          <Download size={14} /> PDF
        </BtnOutline>
      </div>

      <GestionFiltros f={g.filtros} />

      <LotesTabla lotes={g.paginados} vacio={g.lotes.length === 0} onVer={detalle.abrir} />

      <GestionPaginacion
        page={g.page}
        setPage={g.setPage}
        pageSize={g.pageSize}
        onPageSize={g.cambiarPageSize}
        total={g.lotes.length}
        totalPages={g.totalPages}
      />

      {detalle.lote && detalle.handlers && (
        <DetalleLoteModal
          lote={detalle.lote}
          registros={detalle.registros}
          handlers={detalle.handlers}
          generandoLinks={detalle.generandoLinks}
          onCerrar={detalle.cerrar}
          onExportar={detalle.exportar}
          onCopiarLink={detalle.copiarLink}
        />
      )}

      <ConfirmDialog
        confirmLabel="Eliminar"
        variant="danger"
        closeOnConfirm
        open={g.confirmarEliminarId !== null}
        title="¿Eliminar lote?"
        message="Esta accion no se puede deshacer. Los links de pago generados dejaran de funcionar."
        onClose={() => g.setConfirmarEliminarId(null)}
        onConfirm={() => g.eliminar(detalle.cerrarYLimpiar)}
      />
    </>
  );
}
