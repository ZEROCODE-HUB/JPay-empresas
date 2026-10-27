import { ChevronDown, ChevronRight, Eye, FileText, Share2 } from "lucide-react";
import { Badge, BtnOutline, Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import { ESTADO_MOV_TONE, TIPO_LINEA_STYLE } from "../estados";
import type { GruposTxid } from "../hooks/useGruposTxid";
import { formatFechaLinea, labelTipoLinea, prettyTipo, rangoPagina, type Linea } from "../utils";

const BTN_ACCION =
  "h-8 w-8 inline-flex items-center justify-center rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition";

export function MovimientosTabla({
  loading,
  grupos,
  page,
  pageSize,
  totalCount,
  totalPages,
  onPage,
  onBuscarTxid,
  onVerDetalle,
  onDescargar,
  onCompartir,
}: {
  loading: boolean;
  grupos: GruposTxid;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPage: (fn: (p: number) => number) => void;
  onBuscarTxid: (idTxn: string) => void;
  onVerDetalle: (l: Linea) => void;
  onDescargar: (l: Linea) => void;
  onCompartir: (l: Linea) => void;
}) {
  const { filas, agrupar, abiertos, toggleGrupo } = grupos;

  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
              <th className="text-left px-4 py-3 font-semibold">Legajo</th>
              <th className="text-left px-4 py-3 font-semibold">ID transacción</th>
              <th className="text-left px-4 py-3 font-semibold">Tipo</th>
              <th className="text-left px-4 py-3 font-semibold">CVU</th>
              <th className="text-left px-4 py-3 font-semibold">Email</th>
              <th className="text-left px-4 py-3 font-semibold">Nombre</th>
              <th className="text-left px-4 py-3 font-semibold">Nombre destino</th>
              <th className="text-left px-4 py-3 font-semibold">CUIT</th>
              <th className="text-right px-4 py-3 font-semibold">Monto</th>
              <th className="text-left px-4 py-3 font-semibold">Fecha</th>
              <th className="text-left px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filas.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-12 text-sm text-muted-foreground">
                  Sin datos registrados.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={12} className="text-center py-12 text-sm text-muted-foreground">
                  Cargando movimientos...
                </td>
              </tr>
            )}
            {!loading &&
              filas.map((l) => {
                const hija = agrupar && !l.esCabeza;
                return (
                  <tr
                    key={`${l.lineId}:${l.lineNo}`}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${hija ? "bg-muted/20" : ""}`}
                  >
                    <td className="px-4 py-3 text-xs font-mono tabular-nums whitespace-nowrap">
                      {l.legajo}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onBuscarTxid(l.idTxn)}
                        className="text-xs font-mono text-muted-foreground hover:text-foreground hover:underline underline-offset-2 text-left"
                        title="Ver todas las líneas de esta operación"
                      >
                        {l.idTxn}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {l.esCabeza && l.hijas > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleGrupo(l.idTxn)}
                            className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                            title={
                              abiertos.has(l.idTxn)
                                ? "Ocultar desglose"
                                : `Ver desglose (${l.hijas})`
                            }
                          >
                            {abiertos.has(l.idTxn) ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </button>
                        ) : (
                          <span className={hija ? "w-5 h-5 ml-2 border-l-2 border-muted" : "w-5"} />
                        )}
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIPO_LINEA_STYLE[l.tipoLinea]}`}
                        >
                          {labelTipoLinea(l.tipoLinea)}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 ml-6">
                        {prettyTipo(l.tipoOperacion)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {l.cvu || "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">
                      {l.email || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm truncate max-w-[180px]">{l.nombre || "-"}</td>
                    <td className="px-4 py-3 text-sm font-medium truncate max-w-[200px]">
                      {l.nombreDestino || "-"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {l.cuit || "-"}
                    </td>
                    <td
                      className={`px-4 py-3 font-mono tabular-nums text-right font-semibold whitespace-nowrap text-sm ${l.monto >= 0 ? "text-emerald-700" : "text-danger-700"}`}
                    >
                      {formatMoney(l.monto, { signo: true })}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {formatFechaLinea(l.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ESTADO_MOV_TONE[l.estado]}>{l.estado}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          title="Ver detalle de la operación"
                          onClick={() => onVerDetalle(l)}
                          className={BTN_ACCION}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          title="Descargar comprobante"
                          onClick={() => onDescargar(l)}
                          className={BTN_ACCION}
                        >
                          <FileText size={14} />
                        </button>
                        <button
                          title="Compartir comprobante"
                          onClick={() => onCompartir(l)}
                          className={BTN_ACCION}
                        >
                          <Share2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-4 border-t text-xs text-muted-foreground">
        <div>{rangoPagina(page, pageSize, totalCount)}</div>
        <div className="flex gap-2">
          <BtnOutline
            className="h-8 px-4 text-xs"
            disabled={page <= 1}
            onClick={() => onPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </BtnOutline>
          <BtnOutline
            className="h-8 px-4 text-xs"
            disabled={page >= totalPages}
            onClick={() => onPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </BtnOutline>
        </div>
      </div>
    </Card>
  );
}
