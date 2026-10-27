import { createFileRoute } from "@tanstack/react-router";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { AccionesLote } from "@/features/cobros/components/AccionesLote";
import { LoteInfoCards } from "@/features/cobros/components/LoteInfoCards";
import { PaginacionSimple } from "@/features/cobros/components/PaginacionSimple";
import { RegistrosCard } from "@/features/cobros/components/RegistrosCard";
import { RegistrosTabla } from "@/features/cobros/components/RegistrosTabla";
import { usePaginaLocal } from "@/features/cobros/hooks/usePaginaLocal";
import {
  LoteCabecera,
  LoteCargando,
  LoteNoEncontrado,
} from "@/features/cobros/lote/components/LoteCabecera";
import { useDetalleLote } from "@/features/cobros/lote/hooks/useDetalleLote";
import { resumenRegistros } from "@/features/cobros/utils";

export const Route = createFileRoute("/app/cobros/lote/$id")({
  component: DetalleLote,
});

function DetalleLote() {
  const { id } = Route.useParams();
  const d = useDetalleLote(id);
  const pag = usePaginaLocal(d.registros, 10, d.registros.length);

  if (d.cargando) return <LoteCargando />;
  if (!d.lote) return <LoteNoEncontrado id={id} error={d.errorCarga} onVolver={d.volver} />;

  const lote = d.lote;
  const resumen = resumenRegistros(d.registros);

  return (
    <div>
      <LoteCabecera lote={lote} onVolver={d.volver} />

      <AccionesLote
        className="flex flex-wrap gap-2 mb-6"
        estado={lote.estado}
        handlers={d.handlers}
        generandoLinks={d.generandoLinks}
        onExportar={d.exportar}
      />

      <LoteInfoCards className="grid md:grid-cols-2 gap-4 mb-6" lote={lote} resumen={resumen} />

      <RegistrosCard total={resumen.totalRegistros}>
        <RegistrosTabla
          variante="pagina"
          registros={pag.visibles}
          hayRegistros={d.registros.length > 0}
          mediosLote={lote.mediosPago}
          onCopiarLink={d.copiarLink}
        />
        <PaginacionSimple
          className="flex items-center justify-between px-5 py-3 border-t text-xs text-muted-foreground"
          page={pag.page}
          pageSize={pag.pageSize}
          total={d.registros.length}
          totalPages={pag.totalPages}
          onAnterior={pag.anterior}
          onSiguiente={pag.siguiente}
        />
      </RegistrosCard>

      <ConfirmDialog
        confirmLabel="Eliminar"
        variant="danger"
        closeOnConfirm
        open={d.confirmarEliminar}
        title="¿Eliminar lote?"
        message="Esta accion no se puede deshacer. Los links de pago generados dejaran de funcionar."
        onClose={() => d.setConfirmarEliminar(false)}
        onConfirm={d.eliminar}
      />
    </div>
  );
}
