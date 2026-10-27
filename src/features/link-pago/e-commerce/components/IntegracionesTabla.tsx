import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Key,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import { Badge, BtnOutline, Card } from "@/components/portal-shell";
import { ESTADO_ECOM_TONE } from "../estados";
import type { IntegracionesEcom } from "../hooks/useIntegracionesEcom";
import { PAGE_SIZES, rangoPagina } from "../utils";

/** Lista de integraciones */
export function IntegracionesTabla({ s }: { s: IntegracionesEcom }) {
  const { list, paginated, page, setPage, pageSize, setPageSize, totalPages, refreshing } = s;
  const rango = rangoPagina(page, pageSize, list.length);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Integraciones de E-commerce</h2>
        <BtnOutline className="h-8 px-3 text-[11px]" onClick={s.refreshList} disabled={refreshing}>
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> ACTUALIZAR
        </BtnOutline>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
              <th className="text-left px-5 py-2.5">E-commerce</th>
              <th className="text-left px-5 py-2.5">Estado</th>
              <th className="text-left px-5 py-2.5">Fecha de Creacion</th>
              <th className="text-right px-5 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-5 py-3 font-semibold">{e.name}</td>
                <td className="px-5 py-3">
                  <Badge tone={ESTADO_ECOM_TONE[e.estado]}>{e.estado}</Badge>
                </td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{e.created}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => s.toggleEstado(e.id)}
                      className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border bg-card transition text-xs font-semibold text-muted-foreground ${
                        e.estado === "Habilitado"
                          ? "hover:bg-danger-50 hover:text-danger-600"
                          : "hover:bg-emerald-50 hover:text-emerald-600"
                      }`}
                    >
                      {e.estado === "Habilitado" ? <Pause size={12} /> : <Play size={12} />}
                      {e.estado === "Habilitado" ? "DESHABILITAR" : "HABILITAR"}
                    </button>
                    <button
                      onClick={() => s.openClaveModal(e.id, e.name)}
                      className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border bg-card hover:bg-orange-50 hover:text-orange-600 transition text-xs font-semibold text-muted-foreground"
                    >
                      <Key size={12} /> ACTUALIZAR CLAVE
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-5 py-3 border-t flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Items per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="h-8 px-2 rounded border bg-card text-xs"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span>
            {rango.desde}–{rango.hasta} of {list.length}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            className="h-8 w-8 inline-flex items-center justify-center rounded border bg-card hover:bg-muted transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronsLeft size={14} />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="h-8 w-8 inline-flex items-center justify-center rounded border bg-card hover:bg-muted transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="h-8 w-8 inline-flex items-center justify-center rounded border bg-card hover:bg-muted transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            className="h-8 w-8 inline-flex items-center justify-center rounded border bg-card hover:bg-muted transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </Card>
  );
}
