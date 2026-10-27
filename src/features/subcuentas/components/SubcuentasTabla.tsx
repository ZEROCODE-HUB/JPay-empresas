import { BtnOutline, Card } from "@/components/portal-shell";
import type { Sub } from "../types";
import { rangoPagina } from "../utils";
import { SubcuentaFila, type AccionesFila } from "./SubcuentaFila";

type Props = AccionesFila & {
  loading: boolean;
  paginated: Sub[];
  totalFiltradas: number;
  page: number;
  pageSize: number;
  totalPages: number;
  setPage: (fn: (p: number) => number) => void;
  menuId: string | null;
  setMenuId: (fn: string | null | ((cur: string | null) => string | null)) => void;
};

export function SubcuentasTabla({
  loading,
  paginated,
  totalFiltradas,
  page,
  pageSize,
  totalPages,
  setPage,
  menuId,
  setMenuId,
  ...acciones
}: Props) {
  if (loading) {
    return <Card className="p-6 text-sm text-muted-foreground">Cargando subcuentas…</Card>;
  }
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
              <th className="text-left px-4 py-2.5">Tipo</th>
              <th className="text-left px-4 py-2.5">Nombre / Identificador</th>
              <th className="text-left px-4 py-2.5">CVU</th>
              <th className="text-right px-4 py-2.5">Saldo</th>
              <th className="text-right px-4 py-2.5">Límite diario</th>
              <th className="text-left px-4 py-2.5">Estado</th>
              <th className="text-right px-4 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((s) => (
              <SubcuentaFila
                key={s.id ?? s.n}
                s={s}
                menuAbierto={menuId === s.id}
                onToggleMenu={() => setMenuId((cur) => (cur === s.id ? null : (s.id ?? null)))}
                onCerrarMenu={() => setMenuId(null)}
                {...acciones}
              />
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No hay subcuentas para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
        <span>{rangoPagina(page, pageSize, totalFiltradas)}</span>
        <div className="flex gap-1">
          <BtnOutline
            className="h-7 px-2 text-[11px]"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </BtnOutline>
          <BtnOutline
            className="h-7 px-2 text-[11px]"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </BtnOutline>
        </div>
      </div>
    </Card>
  );
}
