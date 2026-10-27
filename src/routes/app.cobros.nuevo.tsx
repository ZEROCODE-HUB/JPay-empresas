import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { usePaginaLocal } from "@/features/cobros/hooks/usePaginaLocal";
import { CargaArchivoPaso } from "@/features/cobros/nuevo/components/CargaArchivoPaso";
import { ConfirmacionPaso } from "@/features/cobros/nuevo/components/ConfirmacionPaso";
import { ParametrosPaso } from "@/features/cobros/nuevo/components/ParametrosPaso";
import { PasosIndicador } from "@/features/cobros/nuevo/components/PasosIndicador";
import { useCargaArchivo } from "@/features/cobros/nuevo/hooks/useCargaArchivo";
import { useNuevoLote } from "@/features/cobros/nuevo/hooks/useNuevoLote";

export const Route = createFileRoute("/app/cobros/nuevo")({ component: NuevoLote });

function NuevoLote() {
  const n = useNuevoLote();
  const carga = useCargaArchivo();
  const pag = usePaginaLocal(carga.filas, 10, carga.filas);

  return (
    <div className="max-w-4xl">
      <button
        type="button"
        onClick={n.volverAGestion}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft size={14} /> Volver a Gestión de lotes
      </button>

      <PasosIndicador paso={n.paso} />

      {n.paso === 0 && (
        <ParametrosPaso
          p={n.params}
          set={n.set}
          toggleMedio={n.toggleMedio}
          onCancelar={n.volverAGestion}
          onSiguiente={n.siguienteDesdeParametros}
        />
      )}

      {n.paso === 1 && (
        <CargaArchivoPaso
          filas={carga.filas}
          pag={pag}
          nombreArchivo={carga.nombreArchivo}
          subiendo={carga.subiendo}
          onArchivo={carga.procesarArchivo}
          onLimpiar={carga.limpiar}
          onAnterior={() => n.setPaso(0)}
          onSiguiente={() => n.setPaso(2)}
        />
      )}

      {n.paso === 2 && (
        <ConfirmacionPaso
          p={n.params}
          filas={carga.filas}
          guardando={n.guardando}
          onAnterior={() => n.setPaso(1)}
          onCrear={() => n.guardar(carga.filas)}
        />
      )}
    </div>
  );
}
