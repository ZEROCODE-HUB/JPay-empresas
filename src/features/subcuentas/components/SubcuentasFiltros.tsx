import { Search } from "lucide-react";
import { Card, Input } from "@/components/portal-shell";
import { TIPOS_SUB } from "../estados";

type Props = {
  q: string;
  onQ: (v: string) => void;
  tipo: string;
  onTipo: (v: string) => void;
  estado: string;
  onEstado: (v: string) => void;
};

export function SubcuentasFiltros({ q, onQ, tipo, onTipo, estado, onEstado }: Props) {
  return (
    <Card className="mb-4 p-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Buscar por nombre o CVU..."
            className="pl-9"
          />
        </div>
        <select
          value={tipo}
          onChange={(e) => onTipo(e.target.value)}
          className="h-10 px-3 rounded-md border bg-card text-sm"
        >
          <option>Todos</option>
          {TIPOS_SUB.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => onEstado(e.target.value)}
          className="h-10 px-3 rounded-md border bg-card text-sm"
        >
          <option>Todos</option>
          <option>Activa</option>
          <option>Pausada</option>
        </select>
      </div>
    </Card>
  );
}
