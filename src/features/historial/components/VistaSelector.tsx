import { Wallet } from "lucide-react";
import { Card } from "@/components/portal-shell";
import { SeccionTabs } from "@/shared/ui/seccion-tabs";
import type { VistaHistorial } from "../hooks/useMovimientosHistorial";

const VISTAS = [
  { id: "principal", label: "Cuenta principal" },
  { id: "sub", label: "Por subcuenta" },
] as const;

export function VistaSelector({
  vista,
  subcuentas,
  sinSubcuentas,
}: {
  vista: VistaHistorial;
  subcuentas: Array<{ nombre: string }>;
  sinSubcuentas: boolean;
}) {
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Wallet size={14} className="text-muted-foreground" />
          <span className="font-semibold">Vista:</span>
        </div>
        <SeccionTabs tabs={VISTAS} value={vista.vista} onChange={vista.setVista} className="" />
        {vista.vista === "sub" &&
          (sinSubcuentas ? (
            <span className="text-xs text-muted-foreground">Sin subcuentas asociadas</span>
          ) : (
            <select
              value={vista.sub}
              onChange={(e) => vista.setSub(e.target.value)}
              className="h-9 px-3 rounded-md border bg-card text-sm"
            >
              {subcuentas.map((s) => (
                <option key={s.nombre}>{s.nombre}</option>
              ))}
            </select>
          ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {vista.vista === "principal"
            ? "Mostrando consolidado de cuenta madre"
            : sinSubcuentas
              ? "Sin subcuentas asociadas"
              : `Filtrando movimientos de ${vista.sub}`}
        </span>
      </div>
    </Card>
  );
}
