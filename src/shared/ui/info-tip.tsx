import { Info } from "lucide-react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";

const ANCHO = 256; // px, igual que w-64
const MARGEN = 8;

/**
 * Ícono «i» que al pasar el mouse, tocarlo o enfocarlo con teclado muestra de dónde sale un dato
 * y cómo se calcula. El globo usa posición fija calculada sobre la pantalla: no lo recorta
 * ningún contenedor con overflow, no ocupa espacio mientras está cerrado y nunca se sale de
 * los bordes (se acomoda solo a izquierda o derecha, y arriba si no cabe abajo).
 */
export function InfoTip({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
  /** Ya no hace falta: el globo se acomoda solo. Se acepta por compatibilidad. */
  align?: "left" | "right";
}) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const abrir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ancho = Math.min(ANCHO, vw - MARGEN * 2);
    const left = Math.max(MARGEN, Math.min(r.left, vw - ancho - MARGEN));
    // Si abajo queda poco espacio, se abre hacia arriba.
    if (vh - r.bottom < 140 && r.top > vh - r.bottom) setPos({ left, bottom: vh - r.top + 6 });
    else setPos({ left, top: r.bottom + 6 });
  }, []);
  const cerrar = useCallback(() => setPos(null), []);

  return (
    <span className={`inline-flex align-middle ${className}`} onMouseLeave={cerrar}>
      <button
        ref={ref}
        type="button"
        aria-describedby={pos ? id : undefined}
        aria-label="Más información"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 cursor-help"
        onMouseEnter={abrir}
        onFocus={abrir}
        onBlur={cerrar}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) cerrar();
          else abrir();
        }}
        onKeyDown={(e) => e.key === "Escape" && cerrar()}
      >
        <Info size={13} aria-hidden />
      </button>
      {pos && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            width: ANCHO,
          }}
          className="pointer-events-none z-[100] max-w-[calc(100vw-16px)] rounded-md border bg-popover px-3 py-2 text-xs font-normal normal-case tracking-normal leading-relaxed text-popover-foreground shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}

/** Etiqueta de tarjeta con su «i» opcional al lado. */
export function EtiquetaConInfo({ label, info }: { label: ReactNode; info?: ReactNode }) {
  if (!info) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <InfoTip>{info}</InfoTip>
    </span>
  );
}
