import { Eye } from "lucide-react";
import { BtnOutline, Card } from "@/components/portal-shell";
import type { LoteResumen } from "@/lib/api/cobros-masivos";
import { formatMoney } from "@/shared/format";
import { ProgresoLote, TablaCobros, type ColCobros } from "../../components/TablaCobros";
import { ESTADO_LOTE_BADGE_DASHBOARD, ESTADO_LOTE_LABEL } from "../../estados";

const COLS: ColCobros[] = [
  { label: "Nombre / Monto" },
  { label: "Estado" },
  { label: "Progreso" },
  { label: "Monto total", align: "right" },
  { label: "Cobrado", align: "right" },
  { label: "Pendiente", align: "right" },
  { label: "Accion", align: "center" },
];

/** Tabla de los 10 lotes más recientes del período. */
export function LotesRecientes({
  lotes,
  onVerTodos,
  onVer,
}: {
  lotes: LoteResumen[];
  onVerTodos: () => void;
  onVer: (id: string) => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <div className="font-semibold">Lotes recientes</div>
          <div className="text-xs text-muted-foreground">
            {lotes.length} lotes en el periodo seleccionado
          </div>
        </div>
        <BtnOutline className="h-9 px-3 text-xs" onClick={onVerTodos}>
          Ver todos
        </BtnOutline>
      </div>
      <TablaCobros cols={COLS} vacio={lotes.length === 0}>
        {lotes.slice(0, 10).map((l) => (
          <tr key={l.id} className="hover:bg-muted/30 transition-colors">
            <td className="px-5 py-3">
              <div className="font-semibold">{l.nombre}</div>
              <div className="text-xs text-muted-foreground">
                {l.cantidadPagos + l.cantidadParciales + l.cantidadPendientes} registros
              </div>
            </td>
            <td className="px-5 py-3">
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  ESTADO_LOTE_BADGE_DASHBOARD[l.estado]
                }`}
              >
                {ESTADO_LOTE_LABEL[l.estado]}
              </span>
            </td>
            <td className="px-5 py-3">
              <ProgresoLote progreso={l.progreso} ancho="flexible" />
            </td>
            <td className="px-5 py-3 font-mono tabular-nums text-right font-semibold">
              {formatMoney(l.montoTotal)}
            </td>
            <td className="px-5 py-3 font-mono tabular-nums text-right text-emerald-600 font-semibold">
              {formatMoney(l.montoCobrado)}
            </td>
            <td className="px-5 py-3 font-mono tabular-nums text-right text-amber-600 font-semibold">
              {formatMoney(l.montoTotal - l.montoCobrado)}
            </td>
            <td className="px-5 py-3 text-center">
              <button
                onClick={() => onVer(l.id)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition"
                title="Ver detalle"
              >
                <Eye size={15} className="text-muted-foreground" />
              </button>
            </td>
          </tr>
        ))}
      </TablaCobros>
    </Card>
  );
}
