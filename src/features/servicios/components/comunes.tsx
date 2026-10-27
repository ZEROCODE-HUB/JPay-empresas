import type { ReactNode } from "react";
import { PREVIEW_LIMIT } from "../utils";

/** Tarjeta chica de KPI (label en mayúsculas, valor y nota opcional). */
export function KpiServicio({
  label,
  value,
  nota,
}: {
  label: string;
  value: ReactNode;
  nota?: ReactNode;
}) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
        {value}
      </div>
      {nota !== undefined && <div className="text-[10px] text-muted-foreground mt-0.5">{nota}</div>}
    </div>
  );
}

/** Botón "Ver todos (n)" / "Mostrar menos"; solo aparece si hay más de PREVIEW_LIMIT. */
export function VerTodos({
  total,
  all,
  onToggle,
}: {
  total: number;
  all: boolean;
  onToggle: () => void;
}) {
  if (total <= PREVIEW_LIMIT) return null;
  return (
    <button
      onClick={onToggle}
      className="w-full text-center text-xs font-semibold text-primary-ink pt-3 pb-1 hover:opacity-80 transition border-t border-border mt-1"
    >
      {all ? "Mostrar menos" : `Ver todos (${total})`}
    </button>
  );
}
