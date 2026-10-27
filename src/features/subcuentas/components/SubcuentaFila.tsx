import {
  ArrowLeftRight,
  Copy,
  Eye,
  History,
  Pause,
  Pencil,
  Play,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import { ESTADO_SUB_TONE, TIPO_LABEL } from "../estados";
import { copiarCvu } from "../export";
import type { EstadoSub, Sub } from "../types";
import { esPool, fmtLimite } from "../utils";
import { RowMenu } from "./RowMenu";

export type AccionesFila = {
  onVerDetalle: (s: Sub) => void;
  onFondear: (s: Sub) => void;
  onVerHistorial: (s: Sub) => void;
  onEditar: (s: Sub) => void;
  onCambiarEstado: (id: string, estado: EstadoSub) => void;
  onBorrar: (s: Sub) => void;
};

type Props = AccionesFila & {
  s: Sub;
  menuAbierto: boolean;
  onToggleMenu: () => void;
  onCerrarMenu: () => void;
};

export function SubcuentaFila({ s, menuAbierto, onToggleMenu, onCerrarMenu, ...acc }: Props) {
  const titular = [s.n, s.apellido].filter(Boolean).join(" ");
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex flex-col items-start gap-0.5">
          <Badge tone={esPool(s) ? "warn" : "neutral"}>{esPool(s) ? "Pool" : "Individual"}</Badge>
          <span className="text-[11px] text-muted-foreground">{TIPO_LABEL[s.tipo] ?? s.tipo}</span>
        </div>
      </td>
      <td className="px-4 py-3 min-w-[160px]">
        <div className="font-semibold">{titular || "Sin nombre"}</div>
        {s.email && (
          <div className="text-xs text-muted-foreground truncate max-w-[220px]">{s.email}</div>
        )}
        {!s.email && esPool(s) && (
          <div className="text-xs text-muted-foreground">Subcuenta del sistema</div>
        )}
      </td>
      <td className="px-4 py-3">
        {s.cbu ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs" title={s.cbu}>
              {s.cbu}
            </span>
            <button
              onClick={() => copiarCvu(s.cbu)}
              className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
              title="Copiar CVU"
            >
              <Copy size={12} />
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Sin CVU</span>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="font-display tabular-nums font-semibold">{formatMoney(s.disp)}</div>
        {s.ret > 0 && (
          <div className="text-[11px] text-muted-foreground tabular-nums">
            Retenido {formatMoney(s.ret)}
          </div>
        )}
      </td>
      <td
        className={`px-4 py-3 text-right whitespace-nowrap tabular-nums ${s.lim ? "" : "text-muted-foreground"}`}
      >
        {fmtLimite(s.lim)}
      </td>
      <td className="px-4 py-3">
        <Badge tone={ESTADO_SUB_TONE[s.e]}>{s.e}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <RowMenu
          open={menuAbierto}
          onToggle={onToggleMenu}
          onClose={onCerrarMenu}
          items={[
            { icon: <Eye size={14} />, label: "Ver detalle", onClick: () => acc.onVerDetalle(s) },
            {
              icon: <ArrowLeftRight size={14} />,
              label: esPool(s) ? "Transferir desde el pool" : "Fondear / transferir",
              onClick: () => acc.onFondear(s),
            },
            { icon: <Copy size={14} />, label: "Copiar CVU", onClick: () => copiarCvu(s.cbu) },
            {
              icon: <History size={14} />,
              label: "Ver historial",
              onClick: () => acc.onVerHistorial(s),
            },
            {
              icon: <SlidersHorizontal size={14} />,
              label: "Configurar límites y responsable",
              onClick: () => acc.onEditar(s),
            },
            { icon: <Pencil size={14} />, label: "Editar datos", onClick: () => acc.onEditar(s) },
            {
              icon: s.e === "Activa" ? <Pause size={14} /> : <Play size={14} />,
              label: s.e === "Activa" ? "Pausar subcuenta" : "Reactivar subcuenta",
              onClick: () => acc.onCambiarEstado(s.id!, s.e === "Activa" ? "Pausada" : "Activa"),
            },
            {
              icon: <Trash2 size={14} />,
              label: "Eliminar",
              danger: true,
              onClick: () => acc.onBorrar(s),
            },
          ]}
        />
      </td>
    </tr>
  );
}
