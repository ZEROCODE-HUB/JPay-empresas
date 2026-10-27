import { Eye } from "lucide-react";
import { BtnOutline, Card } from "@/components/portal-shell";
import type { LoteGestionRow } from "@/lib/api/cobros-masivos";
import { formatMoney } from "@/shared/format";
import { ProgresoLote, TablaCobros, type ColCobros } from "../../components/TablaCobros";
import { ESTADO_LOTE_BADGE, ESTADO_LOTE_LABEL } from "../../estados";

const COLS: ColCobros[] = [
  { label: "Nombre" },
  { label: "Fecha creacion" },
  { label: "Finalizacion" },
  { label: "Estado" },
  { label: "Progreso" },
  { label: "Pagos", align: "right" },
  { label: "Parciales", align: "right" },
  { label: "Pend.", align: "right" },
  { label: "Monto total", align: "right" },
  { label: "Cobrado", align: "right" },
  { label: "Por cobrar", align: "right" },
  { label: "Accion", align: "center" },
];

/** Tabla de lotes de gestión (página actual). */
export function LotesTabla({
  lotes,
  vacio,
  onVer,
}: {
  lotes: LoteGestionRow[];
  vacio: boolean;
  onVer: (id: string) => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <TablaCobros cols={COLS} vacio={vacio}>
        {lotes.map((l) => (
          <tr key={l.id} className="hover:bg-muted/30 transition-colors">
            <td className="px-5 py-3 font-semibold">{l.nombre}</td>
            <td className="px-5 py-3 text-xs text-muted-foreground">{l.createdAt.slice(0, 10)}</td>
            <td className="px-5 py-3 text-xs text-muted-foreground">
              {l.fechaFinalizacion?.slice(0, 10) ?? "-"}
            </td>
            <td className="px-5 py-3">
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  ESTADO_LOTE_BADGE[l.estado]
                }`}
              >
                {ESTADO_LOTE_LABEL[l.estado]}
              </span>
            </td>
            <td className="px-5 py-3">
              <ProgresoLote progreso={l.progreso} ancho="fijo" />
            </td>
            <td className="px-5 py-3 font-mono tabular-nums text-right">{l.cantidadPagos}</td>
            <td className="px-5 py-3 font-mono tabular-nums text-right text-amber-600">
              {l.cantidadParciales}
            </td>
            <td className="px-5 py-3 font-mono tabular-nums text-right text-muted-foreground">
              {l.cantidadPendientes}
            </td>
            <td className="px-5 py-3 font-mono tabular-nums text-right font-semibold">
              {formatMoney(l.montoTotal)}
            </td>
            <td className="px-5 py-3 font-mono tabular-nums text-right text-emerald-600 font-semibold">
              {formatMoney(l.montoCobrado)}
            </td>
            <td className="px-5 py-3 font-mono tabular-nums text-right text-amber-600 font-semibold">
              {formatMoney(l.montoPorCobrar)}
            </td>
            <td className="px-5 py-3 text-center">
              <BtnOutline
                onClick={() => onVer(l.id)}
                className="h-8 px-2.5 text-xs"
                title="Ver detalle"
              >
                <Eye size={14} /> Ver
              </BtnOutline>
            </td>
          </tr>
        ))}
      </TablaCobros>
    </Card>
  );
}
