import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, BtnOutline, Card } from "@/components/portal-shell";
import type { Caja, Sucursal, Terminal } from "@/lib/api/puntos-fisicos";
import { formatMoney } from "@/shared/format";

const TONO: Record<string, "success" | "warn" | "neutral"> = {
  activa: "success",
  pausada: "warn",
  mantenimiento: "warn",
  inactiva: "neutral",
};

/** Una sucursal con sus cajas y la terminal de cada caja. */
export function SucursalCard({
  sucursal,
  terminales,
  ocupado,
  onEditar,
  onBorrar,
  onNuevaCaja,
  onEditarCaja,
  onBorrarCaja,
  onVincular,
}: {
  sucursal: Sucursal;
  terminales: Terminal[];
  ocupado: boolean;
  onEditar: () => void;
  onBorrar: () => void;
  onNuevaCaja: () => void;
  onEditarCaja: (c: Caja) => void;
  onBorrarCaja: (c: Caja) => void;
  onVincular: (c: Caja, terminalId: string | null) => void;
}) {
  const direccion = [
    sucursal.calle,
    sucursal.ciudad,
    sucursal.estado_region,
    sucursal.codigo_postal,
  ]
    .filter(Boolean)
    .join(", ");
  const usadas = new Set(sucursal.cajas.map((c) => c.terminal_id).filter(Boolean));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold flex items-center gap-2">
            {sucursal.nombre}
            <Badge tone={TONO[sucursal.estado] ?? "neutral"}>{sucursal.estado}</Badge>
          </h2>
          {direccion && (
            <p className="text-xs text-black-400 mt-1 flex items-center gap-1">
              <MapPin size={12} /> {direccion}
            </p>
          )}
          {sucursal.encargado && (
            <p className="text-xs text-black-400 mt-0.5">Encargado: {sucursal.encargado}</p>
          )}
        </div>
        <div className="flex gap-2">
          <BtnOutline onClick={onEditar} disabled={ocupado} aria-label="Editar sucursal">
            <Pencil size={14} />
          </BtnOutline>
          <BtnOutline onClick={onBorrar} disabled={ocupado} aria-label="Dar de baja la sucursal">
            <Trash2 size={14} />
          </BtnOutline>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-black-400 text-left">
            <tr>
              <th className="py-2 pr-4">Caja</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Reembolsos</th>
              <th className="py-2 pr-4">Terminal</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {sucursal.cajas.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-black-400">
                  Esta sucursal todavía no tiene cajas.
                </td>
              </tr>
            )}
            {sucursal.cajas.map((c) => (
              <tr key={c.id} className="border-t border-black-100">
                <td className="py-2 pr-4">
                  <span className="font-medium">{c.nombre}</span>{" "}
                  <span className="text-xs text-black-400">#{c.numero}</span>
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={TONO[c.estado] ?? "neutral"}>{c.estado}</Badge>
                </td>
                <td className="py-2 pr-4 text-xs">
                  {c.permite_reembolsos
                    ? c.tope_reembolso != null
                      ? `Hasta ${formatMoney(c.tope_reembolso)}`
                      : "Sí"
                    : "No"}
                </td>
                <td className="py-2 pr-4">
                  <select
                    aria-label={`Terminal de ${c.nombre}`}
                    className="h-8 rounded-md border border-input bg-card px-2 text-xs max-w-[12rem]"
                    value={c.terminal_id ?? ""}
                    disabled={ocupado || terminales.length === 0}
                    onChange={(e) => onVincular(c, e.target.value || null)}
                  >
                    <option value="">
                      {terminales.length ? "Sin terminal" : "No hay terminales"}
                    </option>
                    {terminales.map((t) => (
                      <option
                        key={t.id}
                        value={t.id}
                        disabled={usadas.has(t.id) && c.terminal_id !== t.id}
                      >
                        {t.serie ?? t.id_externo}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    className="p-1.5 text-black-400 hover:text-black-800"
                    onClick={() => onEditarCaja(c)}
                    disabled={ocupado}
                    aria-label={`Editar ${c.nombre}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 text-black-400 hover:text-danger-600"
                    onClick={() => onBorrarCaja(c)}
                    disabled={ocupado}
                    aria-label={`Dar de baja ${c.nombre}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BtnOutline className="mt-3" onClick={onNuevaCaja} disabled={ocupado || !sucursal.id_externo}>
        <Plus size={14} /> Agregar caja
      </BtnOutline>
    </Card>
  );
}
