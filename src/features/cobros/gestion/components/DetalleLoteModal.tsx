import { X } from "lucide-react";
import { estadoCatalogo, type Lote, type RegistroDeLote } from "@/lib/api/cobros-masivos";
import { AccionesLote, type HandlersLote } from "../../components/AccionesLote";
import { LoteInfoCards } from "../../components/LoteInfoCards";
import { RegistrosCard } from "../../components/RegistrosCard";
import { RegistrosTabla } from "../../components/RegistrosTabla";
import { ESTADO_LOTE_BADGE } from "../../estados";
import { resumenRegistros } from "../../utils";

/** Modal con el detalle completo de un lote (acciones, resumen y registros). */
export function DetalleLoteModal({
  lote,
  registros,
  handlers,
  generandoLinks,
  onCerrar,
  onExportar,
  onCopiarLink,
}: {
  lote: Lote;
  registros: RegistroDeLote[];
  handlers: HandlersLote;
  generandoLinks: boolean;
  onCerrar: () => void;
  onExportar: () => void;
  onCopiarLink: (url: string) => void;
}) {
  const resumen = resumenRegistros(registros);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} />
      <div className="relative bg-card rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="min-w-0">
              <h3 className="font-semibold text-lg truncate">{lote.nombre}</h3>
              <p className="text-xs text-muted-foreground">
                ID: {lote.id} &middot; Periodo: {lote.periodo}
              </p>
            </div>
            <span
              className={`shrink-0 inline-block px-3 py-1 rounded-full text-xs font-semibold ${ESTADO_LOTE_BADGE[lote.estado]}`}
            >
              {estadoCatalogo[lote.estado]?.label ?? lote.estado}
            </span>
          </div>
          <button onClick={onCerrar} className="shrink-0 p-1.5 hover:bg-muted rounded-md">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <AccionesLote
            className="flex flex-wrap gap-2"
            estado={lote.estado}
            handlers={handlers}
            generandoLinks={generandoLinks}
            onExportar={onExportar}
          />

          <LoteInfoCards className="grid md:grid-cols-2 gap-4" lote={lote} resumen={resumen} />

          <RegistrosCard total={resumen.totalRegistros}>
            <RegistrosTabla
              variante="modal"
              registros={registros}
              hayRegistros={registros.length > 0}
              mediosLote={lote.mediosPago}
              onCopiarLink={onCopiarLink}
            />
          </RegistrosCard>
        </div>
      </div>
    </div>
  );
}
