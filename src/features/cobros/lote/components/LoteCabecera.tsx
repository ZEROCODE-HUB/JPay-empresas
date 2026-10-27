import { AlertCircle, ArrowLeft } from "lucide-react";
import { BtnOutline } from "@/components/portal-shell";
import { estadoCatalogo, type Lote } from "@/lib/api/cobros-masivos";
import { ESTADO_LOTE_BADGE } from "../../estados";

/** Cabecera del detalle: volver, nombre/ID/periodo y badge de estado. */
export function LoteCabecera({ lote, onVolver }: { lote: Lote; onVolver: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={onVolver}
        className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted transition"
      >
        <ArrowLeft size={18} />
      </button>
      <div className="flex-1">
        <h2 className="text-lg font-semibold">{lote.nombre}</h2>
        <p className="text-xs text-muted-foreground">
          ID: {lote.id} · Periodo: {lote.periodo}
        </p>
      </div>
      <span
        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
          ESTADO_LOTE_BADGE[lote.estado]
        }`}
      >
        {estadoCatalogo[lote.estado]?.label ?? lote.estado}
      </span>
    </div>
  );
}

export function LoteCargando() {
  return (
    <div className="text-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">Cargando lote...</p>
    </div>
  );
}

export function LoteNoEncontrado({
  id,
  error,
  onVolver,
}: {
  id: string;
  error: string | null;
  onVolver: () => void;
}) {
  return (
    <div className="text-center py-12">
      <AlertCircle size={40} className="mx-auto mb-3 text-muted-foreground" />
      <h2 className="font-semibold">Lote no encontrado</h2>
      <p className="text-sm text-muted-foreground mt-1">
        El lote con ID {id} no existe o fue eliminado.
      </p>
      {error && (
        <p className="text-xs text-danger-500 mt-2 font-mono bg-danger-50 rounded px-3 py-2 inline-block">
          Error: {error}
        </p>
      )}
      <BtnOutline className="mt-4" onClick={onVolver}>
        Volver a gestion
      </BtnOutline>
    </div>
  );
}
