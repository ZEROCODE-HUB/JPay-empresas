import { ArrowUpRight, Trash2, Users } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import type { FrequentRecipient } from "@/lib/api/transferencias";
import type { Destinatario } from "../types";
import { AccionBoton } from "./campos";

/** Pestaña "Destinatarios frecuentes". */
export function DestinatariosFrecuentes({
  items,
  onSelect,
  onDelete,
}: {
  items: FrequentRecipient[];
  onSelect: (d: Destinatario) => void;
  onDelete: (id: string) => void | Promise<void>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Users size={32} className="opacity-50" />}
        title="No tenes destinatarios frecuentes"
        description="Los destinatarios se guardan al confirmar una transferencia."
      />
    );
  }

  return (
    <div className="divide-y">
      {items.map((f) => (
        <div key={f.id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{f.nombre}</div>
            <div className="text-xs text-muted-foreground truncate">
              {f.alias ? `@${f.alias} · ` : ""}
              <span className="font-mono">{f.cbu}</span>
              {f.cuit ? ` · CUIT ${f.cuit}` : ""}
            </div>
            {f.banco && <div className="text-[11px] text-muted-foreground/60">{f.banco}</div>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <AccionBoton
              title="Usar este destinatario"
              onClick={() =>
                onSelect({
                  nombre: f.nombre,
                  cuit: f.cuit,
                  cbu: f.cbu,
                  alias: f.alias,
                  banco: f.banco,
                })
              }
            >
              <ArrowUpRight size={13} />
            </AccionBoton>
            <AccionBoton title="Eliminar" peligro onClick={() => void onDelete(f.id)}>
              <Trash2 size={13} />
            </AccionBoton>
          </div>
        </div>
      ))}
    </div>
  );
}
