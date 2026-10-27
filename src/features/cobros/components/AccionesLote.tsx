import type { ReactNode } from "react";
import { FileSpreadsheet, LinkIcon, Pause, Play, PlayIcon, Trash2 } from "lucide-react";
import { BtnOutline, BtnPrimary } from "@/components/portal-shell";
import type { LoteEstado } from "@/lib/api/cobros-masivos";

export interface HandlersLote {
  onIniciar: () => void;
  onPausar: () => void;
  onReanudar: () => void;
  onRegenerarLinks: () => void;
  onEliminar: () => void;
}

type Accion = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant: "primary" | "outline" | "danger";
};

/** Acciones disponibles según el estado del lote. */
function accionesPorEstado(estado: LoteEstado, h: HandlersLote): Accion[] {
  const actions: Accion[] = [];
  const regenerar: Accion = {
    label: "Regenerar links",
    icon: <LinkIcon size={14} />,
    onClick: h.onRegenerarLinks,
    variant: "primary",
  };
  if (estado === "cargado") {
    actions.push({
      label: "Iniciar lote",
      icon: <Play size={14} />,
      onClick: h.onIniciar,
      variant: "primary",
    });
  }
  if (estado === "en_proceso") {
    actions.push({
      label: "Pausar",
      icon: <Pause size={14} />,
      onClick: h.onPausar,
      variant: "outline",
    });
    actions.push(regenerar);
  }
  if (estado === "pausado") {
    actions.push({
      label: "Reanudar",
      icon: <PlayIcon size={14} />,
      onClick: h.onReanudar,
      variant: "primary",
    });
    actions.push(regenerar);
  }
  if (estado !== "finalizado" && estado !== "eliminado") {
    actions.push({
      label: "Eliminar",
      icon: <Trash2 size={14} />,
      onClick: h.onEliminar,
      variant: "danger",
    });
  }
  return actions;
}

/** Barra de acciones del lote (iniciar/pausar/reanudar/regenerar/eliminar + exportar). */
export function AccionesLote({
  estado,
  handlers,
  generandoLinks,
  onExportar,
  className,
}: {
  estado: LoteEstado;
  handlers: HandlersLote;
  generandoLinks: boolean;
  onExportar: () => void;
  className: string;
}) {
  return (
    <div className={className}>
      {accionesPorEstado(estado, handlers).map((a) => {
        const Comp = a.variant === "primary" ? BtnPrimary : BtnOutline;
        const extraClass =
          a.variant === "danger" ? "border-danger-200 text-danger-700 hover:bg-danger-50" : "";
        const isLoading =
          generandoLinks && (a.label === "Iniciar lote" || a.label === "Regenerar links");
        return (
          <Comp
            key={a.label}
            className={`h-9 px-3 text-xs ${extraClass}`}
            onClick={a.onClick}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
                Generando…
              </span>
            ) : (
              <>
                {a.icon} {a.label}
              </>
            )}
          </Comp>
        );
      })}
      <div className="flex-1" />
      <BtnOutline className="h-9 px-3 text-xs" onClick={onExportar}>
        <FileSpreadsheet size={14} /> Exportar Excel
      </BtnOutline>
    </div>
  );
}
