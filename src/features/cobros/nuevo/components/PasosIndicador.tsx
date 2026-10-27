import { Check } from "lucide-react";

const PASOS = ["Parametros generales", "Carga de CSV", "Confirmacion"];

/** Indicador de los 3 pasos del alta de lote. */
export function PasosIndicador({ paso }: { paso: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {PASOS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              i === paso
                ? "bg-primary text-primary-foreground"
                : i < paso
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {i < paso ? <Check size={12} /> : <span>{i + 1}</span>}
            {label}
          </div>
          {i < 2 && <div className="w-6 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}
