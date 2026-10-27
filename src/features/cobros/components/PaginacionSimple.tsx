import { BtnOutline } from "@/components/portal-shell";
import { rangoPagina } from "../utils";

/** Paginación "1–10 de 35 · Anterior / Siguiente" (solo se muestra si hay más de una página). */
export function PaginacionSimple({
  page,
  pageSize,
  total,
  totalPages,
  onAnterior,
  onSiguiente,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onAnterior: () => void;
  onSiguiente: () => void;
  className: string;
}) {
  if (total <= pageSize) return null;
  return (
    <div className={className}>
      <span>{rangoPagina(page, pageSize, total)}</span>
      <div className="flex gap-1">
        <BtnOutline className="h-7 px-2 text-[11px]" disabled={page <= 1} onClick={onAnterior}>
          Anterior
        </BtnOutline>
        <BtnOutline
          className="h-7 px-2 text-[11px]"
          disabled={page >= totalPages}
          onClick={onSiguiente}
        >
          Siguiente
        </BtnOutline>
      </div>
    </div>
  );
}
