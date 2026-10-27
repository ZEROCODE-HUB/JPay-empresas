import { Filter, Search } from "lucide-react";
import { Card, Input, Label } from "@/components/portal-shell";
import type { LoteEstado } from "@/lib/api/cobros-masivos";
import { ESTADOS_LOTE, ESTADO_LOTE_LABEL } from "../../estados";
import type { useGestionLotes } from "../hooks/useGestionLotes";

type Filtros = ReturnType<typeof useGestionLotes>["filtros"];

/** Búsqueda, filtro por estado y rango de fechas de creación. */
export function GestionFiltros({ f }: { f: Filtros }) {
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar por nombre, ID o periodo..."
            value={f.busqueda}
            onChange={(e) => f.setBusqueda(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <select
            value={f.filtroEstado}
            onChange={(e) => f.setFiltroEstado(e.target.value as LoteEstado | "todos")}
            className="h-10 px-3 rounded-md border bg-card text-sm"
          >
            <option value="todos">Todos los estados</option>
            {ESTADOS_LOTE.map((e) => (
              <option key={e} value={e}>
                {ESTADO_LOTE_LABEL[e]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <Label>Desde</Label>
          <Input
            type="date"
            value={f.fechaDesde}
            onChange={(e) => f.setFechaDesde(e.target.value)}
            className="h-9 w-36 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Label>Hasta</Label>
          <Input
            type="date"
            value={f.fechaHasta}
            onChange={(e) => f.setFechaHasta(e.target.value)}
            className="h-9 w-36 text-xs"
          />
        </div>
      </div>
    </Card>
  );
}
