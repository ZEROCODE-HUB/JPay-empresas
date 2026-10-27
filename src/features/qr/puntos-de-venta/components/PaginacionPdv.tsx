import { BtnOutline } from "@/components/portal-shell";
import { rangoPagina } from "../utils";
import type { FiltrosPdvState } from "../hooks/useFiltrosPdv";

const ROWS_OPTIONS = [10, 20, 50];

export function PaginacionPdv({ f }: { f: FiltrosPdvState }) {
  const { page, setPage, pageSize, totalPages } = f;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Filas por página:</span>
        <select
          className="h-8 px-2 rounded border bg-card text-xs"
          value={pageSize}
          onChange={(e) => f.setPageSize(Number(e.target.value))}
        >
          {ROWS_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>{rangoPagina(page, pageSize, f.filtered.length)}</span>
      </div>
      <div className="flex gap-1">
        <BtnOutline className="h-8 px-3 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>
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
          onClick={() => setPage(totalPages)}
        >
          ultimo
        </BtnOutline>
      </div>
    </div>
  );
}
