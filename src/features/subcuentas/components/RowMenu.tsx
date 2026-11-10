import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export type RowMenuItem = { icon: ReactNode; label: string; onClick: () => void; danger?: boolean };

const MENU_WIDTH = 240; // w-60
const GAP = 4;
const EDGE = 8;

/**
 * Menú desplegable "Acciones" de una fila; se cierra al hacer clic afuera o con Escape.
 * Se dibuja en un portal sobre el body con posición fija: así no lo recorta el
 * `overflow` de la tabla ni de la tarjeta que la contiene. Si no entra debajo
 * del botón, se abre hacia arriba.
 */
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const btn = buttonRef.current;
    const menu = menuRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const height = menu?.offsetHeight ?? 0;
    const below = r.bottom + GAP;
    const fitsBelow = below + height <= window.innerHeight - EDGE;
    const top = fitsBelow ? below : Math.max(EDGE, r.top - GAP - height);
    const left = Math.min(
      Math.max(EDGE, r.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - EDGE,
    );
    setPos({ top, left });
  }, []);

  // Se ubica antes de pintar (y otra vez cuando ya se conoce su alto).
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Al desplazar la página o la tabla, el menú sigue al botón.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, place]);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        onClick={onToggle}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition"
        title="Acciones"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: MENU_WIDTH,
            }}
            className="z-50 rounded-md border bg-card shadow-lg py-1"
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
          </div>,
          document.body,
        )}
    </div>
  );
}
