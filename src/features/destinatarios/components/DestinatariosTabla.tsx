import { Search, Send, Star, Trash2 } from "lucide-react";
import { BtnOutline, Card, Input } from "@/components/portal-shell";
import { formatDate } from "@/shared/format";
import type { OrdenDestinatarios } from "@/features/transferencias/utils";
import type { AgendaDestinatarios } from "../hooks/useAgendaDestinatarios";
import type { Destinatario } from "../utils";

export function DestinatariosTabla({
  agenda,
  onTransferir,
}: {
  agenda: AgendaDestinatarios;
  onTransferir: (d: Destinatario) => void;
}) {
  const { busqueda, setBusqueda, orden, setOrden, visibles, cargando, hayAgenda, setEliminar } =
    agenda;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b flex flex-wrap gap-2 items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-[240px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar por nombre, alias o CBU..."
            className="pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className="h-10 px-3 rounded-md border bg-card text-sm"
          value={orden}
          onChange={(e) => setOrden(e.target.value as OrdenDestinatarios)}
        >
          <option value="recientes">Ordenar: recientes</option>
          <option value="alfabetico">Alfabetico</option>
        </select>
      </div>

      <div className="hidden md:grid grid-cols-[auto_1.2fr_1fr_1.4fr_0.8fr_0.8fr_auto] gap-4 px-5 py-3 border-b text-xs uppercase tracking-wide text-muted-foreground">
        <div></div>
        <div>Nombre</div>
        <div>Alias</div>
        <div>CBU</div>
        <div>Banco</div>
        <div>Agregado</div>
        <div></div>
      </div>
      {!hayAgenda && !cargando && (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Todavía no guardaste destinatarios. Cargá uno con "Nuevo destinatario".
        </div>
      )}
      {hayAgenda && visibles.length === 0 && (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Ningún destinatario coincide con "{busqueda.trim()}".
        </div>
      )}
      {cargando && (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Cargando agenda…</div>
      )}
      {visibles.map((d) => (
        <div
          key={d.id || d.n}
          className="md:grid md:grid-cols-[auto_1.2fr_1fr_1.4fr_0.8fr_0.8fr_auto] gap-4 px-5 py-4 border-b last:border-0 items-center"
        >
          <Star
            size={14}
            className={d.fav ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}
          />
          <div>
            <div className="font-semibold">{d.n}</div>
            <div className="text-xs text-muted-foreground md:hidden">
              {d.a ? `@${d.a} · ` : ""}
              {d.b}
            </div>
          </div>
          <div className="text-sm text-muted-foreground hidden md:block">
            {d.a ? `@${d.a}` : "—"}
          </div>
          <div className="text-sm font-mono text-muted-foreground hidden md:block">{d.cbu}</div>
          <div className="text-sm text-muted-foreground hidden md:block truncate">{d.b}</div>
          <div className="text-sm text-muted-foreground hidden md:block">
            {d.creadoEn ? formatDate(d.creadoEn) : "—"}
          </div>
          <div className="flex gap-1 mt-2 md:mt-0 justify-end">
            <BtnOutline className="h-9 px-3" onClick={() => onTransferir(d)}>
              <Send size={14} /> Transferir
            </BtnOutline>
            <button
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border bg-card hover:bg-danger-50 text-muted-foreground hover:text-danger-600"
              title="Eliminar de la agenda"
              onClick={() => setEliminar(d)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </Card>
  );
}
