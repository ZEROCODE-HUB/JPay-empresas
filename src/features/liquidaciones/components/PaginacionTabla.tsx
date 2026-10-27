import { BtnOutline } from "@/components/portal-shell";
import { FILAS_POR_PAGINA, type Paginacion } from "../hooks/usePaginacion";

/** Pie de tabla "Filas por página · 1–10 de N · Primero/Anterior/Siguiente/Último". */
export function PaginacionTabla({ p }: { p: Paginacion<unknown> }) {
  if (p.total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-t">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Filas por página:</span>
        <select
          className="h-8 px-2 rounded border bg-card text-xs"
          value={p.pageSize}
          onChange={(e) => p.setPageSize(Number(e.target.value))}
        >
          {FILAS_POR_PAGINA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>{`${p.desde}–${p.hasta} de ${p.total}`}</span>
      </div>
      <div className="flex gap-1">
        <BtnOutline
          className="h-8 px-3 text-xs"
          disabled={p.page <= 1}
          onClick={() => p.setPage(1)}
        >
          Primero
        </BtnOutline>
        <BtnOutline
          className="h-8 px-3 text-xs"
          disabled={p.page <= 1}
          onClick={() => p.setPage((x) => Math.max(1, x - 1))}
        >
          Anterior
        </BtnOutline>
        <span className="flex items-center px-3 text-xs text-muted-foreground">
          {p.page} / {p.totalPages}
        </span>
        <BtnOutline
          className="h-8 px-3 text-xs"
          disabled={p.page >= p.totalPages}
          onClick={() => p.setPage((x) => Math.min(p.totalPages, x + 1))}
        >
          Siguiente
        </BtnOutline>
        <BtnOutline
          className="h-8 px-3 text-xs"
          disabled={p.page >= p.totalPages}
          onClick={() => p.setPage(p.totalPages)}
        >
          Último
        </BtnOutline>
      </div>
    </div>
  );
}
