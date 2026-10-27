import type { ReactNode } from "react";
import { FormDialog } from "@/shared/ui/form-dialog";
import type { FrequentRecipient } from "@/lib/api/transferencias";
import { CONCEPTOS } from "../utils";

/** Selector de concepto (mismas opciones en todos los formularios). */
export function ConceptoSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="w-full h-10 px-3 rounded-md border bg-card text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {CONCEPTOS.map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
}

/** Filas clave/valor de las pantallas "Revisa los datos antes de...". */
export function ResumenFilas({ filas }: { filas: [string, string][] }) {
  return (
    <div className="border rounded-md divide-y">
      {filas.map(([k, v]) => (
        <div key={k} className="flex justify-between py-2.5 px-3 text-sm">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-mono tabular-nums font-semibold">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Modal para elegir un destinatario de la agenda de frecuentes. */
export function FrecuentesPickerDialog({
  open,
  onClose,
  frecuentes,
  onElegir,
}: {
  open: boolean;
  onClose: () => void;
  frecuentes: FrequentRecipient[];
  onElegir: (f: FrequentRecipient) => void;
}) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Destinatarios frecuentes"
      description="Selecciona un destinatario de tu lista."
      submitLabel="Cerrar"
      onSubmit={onClose}
      size="md"
    >
      {frecuentes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No tenes destinatarios frecuentes guardados.
        </div>
      ) : (
        <div className="divide-y border rounded-md max-h-64 overflow-y-auto">
          {frecuentes.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onElegir(f)}
              className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{f.nombre}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {f.alias ? `@${f.alias} · ` : ""}
                  <span className="font-mono">{f.cbu}</span>
                </div>
              </div>
              {f.banco && (
                <span className="text-[11px] text-muted-foreground shrink-0">{f.banco}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </FormDialog>
  );
}

/** Botón cuadrado de acción en las filas de las listas (editar, ejecutar, borrar). */
export function AccionBoton({
  title,
  onClick,
  peligro,
  children,
}: {
  title: string;
  onClick: () => void;
  /** Hover rojo (eliminar/cancelar). */
  peligro?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card text-muted-foreground ${
        peligro ? "hover:bg-danger-50 hover:text-danger-600" : "hover:bg-accent"
      }`}
      title={title}
    >
      {children}
    </button>
  );
}
