/**
 * Pestañas de una sección (píldoras): cambian la vista dentro de una misma pantalla o, con
 * `onChange` navegando, entre sub-rutas de un mismo layout.
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 */
import type { ReactNode } from "react";

export type SeccionTab<T extends string> = { id: T; label: string };

export function SeccionTabs<T extends string>({
  tabs,
  value,
  onChange,
  className = "mb-6",
  children,
}: {
  tabs: ReadonlyArray<SeccionTab<T>>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Contenido extra a la derecha de las pestañas (filtros, avisos). */
  children?: ReactNode;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-4 ${className}`}>
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
              value === t.id
                ? "bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)] border-transparent"
                : "bg-card hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
