import { Search } from "lucide-react";
import { Card, Input, Label } from "@/components/portal-shell";
import { ESTADOS_FILTRO } from "../estados";
import { hayFiltros } from "../utils";
import type { FiltrosPdvState } from "../hooks/useFiltrosPdv";

export function FiltrosPdv({ f }: { f: FiltrosPdvState }) {
  const { filtros, setFiltro } = f;
  return (
    <Card className="mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <Label>Nombre</Label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              placeholder="Buscar por nombre..."
              value={filtros.search}
              onChange={(e) => setFiltro("search", e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Estado</Label>
          <select
            className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            value={filtros.estado}
            onChange={(e) => setFiltro("estado", e.target.value)}
          >
            {ESTADOS_FILTRO.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Fecha inicio</Label>
          <Input
            type="date"
            value={filtros.fechaInicio}
            onChange={(e) => setFiltro("fechaInicio", e.target.value)}
          />
        </div>
        <div>
          <Label>Fecha fin</Label>
          <Input
            type="date"
            value={filtros.fechaFin}
            onChange={(e) => setFiltro("fechaFin", e.target.value)}
          />
        </div>
      </div>
      {hayFiltros(filtros) && (
        <button
          onClick={f.resetFilters}
          className="mt-3 text-xs text-primary-ink font-semibold hover:underline"
        >
          Limpiar filtros
        </button>
      )}
    </Card>
  );
}
