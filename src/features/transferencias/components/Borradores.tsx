import { Edit3, FileText, Play, Trash2 } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import type { Draft } from "@/lib/api/transferencias";
import { AccionBoton } from "./campos";

/** Pestaña "Borradores". */
export function Borradores({
  drafts,
  onDelete,
  onEdit,
  onExecute,
}: {
  drafts: Draft[];
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onExecute: (id: string) => void;
}) {
  if (drafts.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={32} className="opacity-50" />}
        title="No tenes borradores"
        description="Las transferencias que guardes como borrador apareceran aca."
      />
    );
  }

  return (
    <div className="divide-y">
      {drafts.map((d) => (
        <div key={d.id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{d.destinatario}</div>
            <div className="text-xs text-muted-foreground">
              @{d.alias} · <span className="font-mono">{d.monto}</span> · {d.concepto}
            </div>
            <div className="text-[11px] text-muted-foreground/60">Guardado el {d.fecha}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <AccionBoton title="Editar" onClick={() => onEdit(d.id)}>
              <Edit3 size={13} />
            </AccionBoton>
            <AccionBoton title="Ejecutar" onClick={() => onExecute(d.id)}>
              <Play size={13} />
            </AccionBoton>
            <AccionBoton title="Eliminar" peligro onClick={() => onDelete(d.id)}>
              <Trash2 size={13} />
            </AccionBoton>
          </div>
        </div>
      ))}
    </div>
  );
}
