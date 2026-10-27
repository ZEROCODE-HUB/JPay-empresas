import { BtnOutline } from "@/components/portal-shell";
import { rangoPagina } from "../../utils";

const ROWS_OPTIONS = [10, 20, 50];

/** Paginación de gestión: filas por página, rango y primero/anterior/siguiente/último. */
export function GestionPaginacion({
  page,
  setPage,
  pageSize,
  onPageSize,
  total,
  totalPages,
}: {
  page: number;
  setPage: (fn: (p: number) => number) => void;
  pageSize: number;
  onPageSize: (n: number) => void;
  total: number;
  totalPages: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Filas por pagina:</span>
        <select
          className="h-8 px-2 rounded border bg-card text-xs"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {ROWS_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>{total === 0 ? "0 registros" : rangoPagina(page, pageSize, total)}</span>
      </div>
      <div className="flex gap-1">
        <BtnOutline
          className="h-8 px-3 text-xs"
          disabled={page <= 1}
          onClick={() => setPage(() => 1)}
        >
          Primero
        </BtnOutline>
        <BtnOutline
          className="h-8 px-3 text-xs"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Anterior
        </BtnOutline>
        <span className="flex items-center px-3 text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <BtnOutline
          className="h-8 px-3 text-xs"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Siguiente
        </BtnOutline>
        <BtnOutline
          className="h-8 px-3 text-xs"
          disabled={page >= totalPages}
          onClick={() => setPage(() => totalPages)}
        >
          Ultimo
        </BtnOutline>
      </div>
    </div>
  );
}
