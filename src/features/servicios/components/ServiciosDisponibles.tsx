import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { BtnOutline, BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import type { PantallaServicios } from "../hooks/usePantallaServicios";
import type { Item } from "../types";
import { CATEGORIAS, preview } from "../utils";
import { VerTodos } from "./comunes";

/** Formulario "Suscribir un servicio" + lista de servicios disponibles. */
export function ServiciosDisponibles({
  alta,
  disponibles,
  all,
  onToggleAll,
  onEscanear,
}: {
  alta: PantallaServicios["alta"];
  disponibles: Item[];
  all: boolean;
  onToggleAll: () => void;
  onEscanear: () => void;
}) {
  return (
    <>
      <Card className="mb-6">
        <h3 className="font-semibold text-sm mb-4">Suscribir un servicio</h3>
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <div>
            <Label>Nombre del servicio</Label>
            <Input
              value={alta.nombreNuevo}
              onChange={(e) => alta.setNombreNuevo(e.target.value)}
              placeholder="Ej. Mi proveedor"
            />
          </div>
          <div>
            <Label>Categoria</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={alta.catNueva}
              onChange={(e) => alta.setCatNueva(e.target.value)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[220px]">
            <Label>Numero de cliente / codigo de barra</Label>
            <Input
              value={alta.numeroNuevo}
              onChange={(e) => alta.setNumeroNuevo(e.target.value)}
              placeholder="Escanear o ingresar numero"
            />
          </div>
          <BtnOutline className="h-10" onClick={onEscanear}>
            <ScanLine size={14} /> Escanear codigo
          </BtnOutline>
          <BtnPrimary
            className="h-10"
            disabled={!alta.numeroNuevo.trim()}
            onClick={alta.addSuscripcion}
          >
            Suscribir
          </BtnPrimary>
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="font-semibold text-sm mb-4">Servicios disponibles para suscribir</h3>
        <div className="divide-y">
          {preview(disponibles, all).map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.n + s.c} className="flex items-center justify-between gap-3 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {s.n} <span className="text-muted-foreground font-normal">· {s.cat}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">No suscrito</div>
                  </div>
                </div>
                <BtnPrimary
                  className="h-9 px-4 shrink-0"
                  onClick={() => {
                    toast.success("Suscripcion a " + s.n + " iniciada");
                  }}
                >
                  Suscribir
                </BtnPrimary>
              </div>
            );
          })}
        </div>
        <VerTodos total={disponibles.length} all={all} onToggle={onToggleAll} />
      </Card>
    </>
  );
}
