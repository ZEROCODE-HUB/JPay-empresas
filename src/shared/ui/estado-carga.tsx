import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { mensajeError } from "@/shared/errores";

/**
 * Estados de una consulta, iguales en todas las pantallas:
 *   cargando → <Cargando /> (gris animado, nunca $0 ni «sin datos»)
 *   error    → <ErrorCarga /> («No se pudo cargar» + Reintentar)
 *   vacío    → EmptyState / mensaje vacío, solo cuando la consulta terminó bien
 */

/** Bloque gris animado del tamaño de un número o una línea de texto. */
export function Cargando({ className = "h-[1em] w-24" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`inline-block align-middle rounded bg-muted animate-pulse ${className}`}
    />
  );
}

/** Mensaje de una consulta que falló. `compacto` para dentro de una tarjeta o una fila. */
export function ErrorCarga({
  error,
  onRetry,
  compacto = false,
  titulo = "No se pudo cargar la información",
}: {
  error?: unknown;
  onRetry?: () => void;
  compacto?: boolean;
  titulo?: string;
}) {
  const detalle = mensajeError(error);
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 text-sm ${
        compacto ? "py-2" : "rounded-lg border border-danger-200 bg-danger-50 p-4"
      }`}
    >
      <AlertTriangle size={18} className="text-danger-600 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-danger-700">{titulo}</div>
        {detalle && <div className="mt-0.5 text-muted-foreground break-words">{detalle}</div>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 shrink-0 h-8 px-3 rounded-md border bg-card text-sm font-medium hover:bg-muted"
        >
          <RefreshCw size={14} /> Reintentar
        </button>
      )}
    </div>
  );
}

/** Filas grises animadas para una tabla hecha a mano (en vez de "No hay registros."). */
export function FilasCargando({ colSpan, filas = 4 }: { colSpan: number; filas?: number }) {
  return (
    <>
      {Array.from({ length: filas }).map((_, i) => (
        <tr key={i}>
          <td colSpan={colSpan} className="px-5 py-3">
            <div
              role="status"
              aria-label="Cargando"
              className="h-6 rounded bg-muted animate-pulse"
            />
          </td>
        </tr>
      ))}
    </>
  );
}

/** Fila con «No se pudo cargar» para una tabla hecha a mano. */
export function FilaError({
  colSpan,
  error,
  onRetry,
}: {
  colSpan: number;
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-4">
        <ErrorCarga error={error} onRetry={onRetry} compacto />
      </td>
    </tr>
  );
}

type Consulta<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

/**
 * Muestra el contenido de una consulta solo cuando llegó: mientras carga, un bloque gris; si
 * falló, «No se pudo cargar» con Reintentar. Así un «todavía no tienes…» nunca aparece antes de
 * que lleguen los datos. Si ya había datos y falla un refresco, se siguen mostrando.
 */
export function EstadoConsulta<T>({
  q,
  alto = "h-40",
  children,
}: {
  q: Consulta<T>;
  /** Alto del bloque gris mientras carga (clase de Tailwind). */
  alto?: string;
  children: (data: T) => ReactNode;
}) {
  if (q.data !== undefined) return <>{children(q.data)}</>;
  if (q.isError) return <ErrorCarga error={q.error} onRetry={() => void q.refetch()} />;
  return <Cargando className={`block w-full ${alto}`} />;
}
