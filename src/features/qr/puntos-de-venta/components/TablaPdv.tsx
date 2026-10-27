import { Edit3, Eye, Trash2 } from "lucide-react";
import { Badge, BtnOutline, Card } from "@/components/portal-shell";
import type { PuntoVenta } from "@/lib/api/qr";
import { formatDate } from "@/shared/format";
import { tonoEstadoPdv } from "../estados";

const GRID = "lg:grid-cols-[1.4fr_0.8fr_1fr_1.1fr]";

export function TablaPdv({
  loading,
  filas,
  onVer,
  onEditar,
  onEliminar,
}: {
  loading: boolean;
  filas: PuntoVenta[];
  onVer: (p: PuntoVenta) => void;
  onEditar: (p: PuntoVenta) => void;
  onEliminar: (id: string) => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div
        className={`hidden lg:grid ${GRID} gap-4 px-5 py-3 border-b text-xs uppercase tracking-wide text-muted-foreground bg-muted/30`}
      >
        <div>Nombre</div>
        <div>Estado</div>
        <div>Fecha de creación</div>
        <div className="text-right">Acciones</div>
      </div>
      {loading ? (
        <div className="px-5 py-12 text-center text-sm text-muted-foreground">
          Cargando puntos de venta…
        </div>
      ) : filas.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-muted-foreground">No hay registros</div>
      ) : (
        filas.map((p) => (
          <div
            key={p.id}
            className={`lg:grid ${GRID} gap-4 px-5 py-3.5 border-b last:border-0 items-center`}
          >
            <div className="font-semibold text-sm">{p.nombre}</div>
            <div>
              <Badge tone={tonoEstadoPdv(p.estado)}>{p.estado}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">{formatDate(p.created_at)}</div>
            <div className="flex gap-1 justify-end">
              <BtnOutline className="h-8 px-2.5 text-xs" onClick={() => onVer(p)}>
                <Eye size={13} /> Ver
              </BtnOutline>
              <BtnOutline className="h-8 px-2.5 text-xs" onClick={() => onEditar(p)}>
                <Edit3 size={13} /> Editar
              </BtnOutline>
              <BtnOutline
                className="h-8 px-2.5 text-xs hover:border-danger-400 hover:text-danger-600"
                onClick={() => onEliminar(p.id)}
              >
                <Trash2 size={13} /> Eliminar
              </BtnOutline>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
