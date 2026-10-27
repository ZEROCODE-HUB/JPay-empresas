import { Clock, Search } from "lucide-react";
import { Badge, BtnOutline, BtnPrimary, Card, Input } from "@/components/portal-shell";
import { ESTADO_SERVICIO_TONE } from "../estados";
import type { Item } from "../types";
import { cats, preview } from "../utils";
import { VerTodos } from "./comunes";

export function ServiciosSuscritos({
  suscritos,
  sort,
  onSort,
  catFilt,
  onCatFilt,
  all,
  onToggleAll,
  onEditar,
  onPagar,
}: {
  suscritos: Item[];
  sort: string;
  onSort: (s: string) => void;
  catFilt: string;
  onCatFilt: (c: string) => void;
  all: boolean;
  onToggleAll: () => void;
  onEditar: (s: Item) => void;
  onPagar: (s: Item) => void;
}) {
  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Servicios suscritos</h3>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input placeholder="Buscar servicio o numero de cuenta..." className="pl-9" />
        </div>
        <select
          className="h-10 px-3 rounded-md border bg-card text-sm"
          value={sort}
          onChange={(e) => onSort(e.target.value)}
        >
          <option value="vencimiento">Orden: vencimiento</option>
          <option value="monto">Monto</option>
          <option value="alfabetico">Alfabetico</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => onCatFilt(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${catFilt === c ? "bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)] border-transparent" : "bg-card hover:bg-muted"}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="divide-y">
        {preview(suscritos, all).map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.n + s.c} className="flex items-center justify-between gap-3 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-md bg-[color:var(--brand-primary-50)] flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-[color:var(--brand-primary-700)]" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {s.n} <span className="text-muted-foreground font-normal">· {s.cat}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{s.c}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-semibold">{s.v}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end">
                    <Clock size={10} /> Vence {s.venc}
                  </div>
                </div>
                <Badge tone={ESTADO_SERVICIO_TONE[s.e]}>{s.e}</Badge>
                <BtnOutline className="h-9 px-2.5 text-xs" onClick={() => onEditar(s)}>
                  Editar
                </BtnOutline>
                <BtnPrimary className="h-9 px-4" onClick={() => onPagar(s)}>
                  Pagar
                </BtnPrimary>
              </div>
            </div>
          );
        })}
      </div>
      <VerTodos total={suscritos.length} all={all} onToggle={onToggleAll} />
    </Card>
  );
}
