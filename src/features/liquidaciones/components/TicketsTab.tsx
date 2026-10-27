import { Eye, Plus } from "lucide-react";
import { Badge, BtnOutline, BtnPrimary } from "@/components/portal-shell";
import type { Ticket } from "@/lib/api/liquidaciones";
import { formatDate, formatMoney } from "@/shared/format";
import { ESTADO_TICKET_LABEL, ESTADO_TICKET_TONE } from "../estados";
import type { Paginacion } from "../hooks/usePaginacion";
import { PaginacionTabla } from "./PaginacionTabla";
import { TablaLiquidaciones } from "./tabla";

const COLS = [
  { label: "Ticket" },
  { label: "Fecha solicitud" },
  { label: "Monto solicitado", align: "right" },
  { label: "Acredita" },
  { label: "Estado" },
  { label: "Acción", align: "center" },
] as const;

export function TicketsTab({
  pag,
  onNuevo,
  onVer,
}: {
  pag: Paginacion<Ticket>;
  onNuevo: () => void;
  onVer: (t: Ticket) => void;
}) {
  return (
    <div>
      <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">{pag.total} solicitudes</div>
        <BtnPrimary className="h-9 px-3 text-xs" onClick={onNuevo}>
          <Plus size={14} /> Nuevo ticket
        </BtnPrimary>
      </div>
      <TablaLiquidaciones
        cols={[...COLS]}
        vacio={
          pag.total === 0
            ? "Aún no solicitaste adelantos. Elegí un día del calendario y creá tu primer ticket."
            : null
        }
      >
        {pag.rows.map((t) => (
          <tr key={t.id} className="hover:bg-muted/30">
            <td className="px-5 py-3 font-mono font-semibold">{t.id}</td>
            <td className="px-5 py-3 text-xs text-muted-foreground">{formatDate(t.fecha)}</td>
            <td className="px-5 py-3 font-mono tabular-nums text-right font-semibold">
              {formatMoney(t.montoSolicitado)}
            </td>
            <td className="px-5 py-3 text-xs">{formatDate(t.fechaAcreditacion)}</td>
            <td className="px-5 py-3">
              <Badge tone={ESTADO_TICKET_TONE[t.estado]}>{ESTADO_TICKET_LABEL[t.estado]}</Badge>
            </td>
            <td className="px-5 py-3 text-center">
              <BtnOutline className="h-8 px-2.5 text-xs" onClick={() => onVer(t)}>
                <Eye size={13} /> Ver
              </BtnOutline>
            </td>
          </tr>
        ))}
      </TablaLiquidaciones>
      <PaginacionTabla p={pag} />
    </div>
  );
}
