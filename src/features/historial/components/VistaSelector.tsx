import { Wallet } from "lucide-react";
import { Card } from "@/components/portal-shell";
import type { VistaHistorial } from "../hooks/useMovimientosHistorial";

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
        <div className="flex gap-1.5">
          {(
            [
              ["principal", "Cuenta principal"],
              ["sub", "Por subcuenta"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => vista.setVista(k)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
                vista.vista === k
                  ? "bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)] border-transparent"
                  : "bg-card hover:bg-muted"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
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
