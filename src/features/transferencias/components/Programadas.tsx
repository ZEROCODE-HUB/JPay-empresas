import { Calendar, Clock, Edit3, Play, X } from "lucide-react";
import { Badge } from "@/components/portal-shell";
import { EmptyState } from "@/shared/ui/empty-state";
import type { Scheduled } from "@/lib/api/transferencias";
import { STATUS_TONE } from "../utils";
import { AccionBoton } from "./campos";

/** Pestaña "Transferencias programadas". */
export function Programadas({
  items,
  onCancel,
  onEdit,
  onExecute,
}: {
  items: Scheduled[];
  onCancel: (id: string) => void;
  onEdit: (id: string) => void;
  onExecute: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={32} className="opacity-50" />}
        title="No tenes transferencias programadas"
        description={'Usa la pestana "Programar" para agendar una transferencia.'}
      />
    );
  }

  return (
    <div className="divide-y">
      {items.map((s) => (
        <div key={s.id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{s.destinatario}</div>
            <div className="text-xs text-muted-foreground">
              @{s.alias} · <span className="font-mono">{s.monto}</span> · {s.concepto}
            </div>
            <div className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
              <Calendar size={11} /> {s.fecha} <Clock size={11} className="ml-1" /> {s.hora}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge tone={STATUS_TONE[s.estado] ?? "neutral"}>{s.estado}</Badge>
            {s.estado === "Programada" && (
              <>
                <AccionBoton title="Editar" onClick={() => onEdit(s.id)}>
                  <Edit3 size={13} />
                </AccionBoton>
                <AccionBoton title="Ejecutar ahora" onClick={() => onExecute(s.id)}>
                  <Play size={13} />
                </AccionBoton>
                <AccionBoton title="Cancelar" peligro onClick={() => onCancel(s.id)}>
                  <X size={13} />
                </AccionBoton>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
