import { useEffect, useRef, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

export type RowMenuItem = { icon: ReactNode; label: string; onClick: () => void; danger?: boolean };

/** Menú desplegable "Acciones" de una fila; se cierra al hacer clic afuera o con Escape. */
export function RowMenu({
  open,
  onToggle,
  onClose,
  items,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  items: RowMenuItem[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        onClick={onToggle}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition"
        title="Acciones"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-60 rounded-md border bg-card shadow-lg py-1"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                onClose();
                it.onClick();
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
                it.danger ? "text-danger-600 hover:bg-danger-50" : "hover:bg-muted"
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
