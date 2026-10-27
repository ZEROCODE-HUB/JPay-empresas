import { ArrowDownLeft, ArrowUpRight, Download, Share2, X } from "lucide-react";
import { Badge, BtnOutline, BtnPrimary } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import { ESTADO_MOV_TONE } from "../estados";
import { debitaCargos, montoDebitado, montoDetalleTexto, type Mov } from "../utils";

/** Comprobante de transacción: detalle de una operación con descarga y compartir. */
export function DetalleMovimientoDialog({
  detalle,
  onClose,
  onDescargar,
  onCompartir,
}: {
  detalle: Mov;
  onClose: () => void;
  onDescargar: (m: Mov) => void;
  onCompartir: (m: Mov) => void;
}) {
  const ingreso = detalle.tipo === "ingreso";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10 rounded-t-xl">
          <div className="font-semibold">Comprobante de transaccion</div>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-accent transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4 pb-5 border-b">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                ingreso ? "bg-emerald-50 text-emerald-600" : "bg-danger-50 text-danger-600"
              }`}
            >
              {ingreso ? <ArrowDownLeft size={26} /> : <ArrowUpRight size={26} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xl font-bold">
                {ingreso ? "Recibiste dinero" : "Enviaste dinero"}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span>{detalle.medio}</span>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                <span>{detalle.fecha}</span>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between pb-5 border-b">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Monto</div>
              <div
                className={`font-display tabular-nums text-2xl font-bold ${ingreso ? "text-emerald-700" : ""}`}
              >
                {montoDetalleTexto(detalle)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-1">Estado</div>
              <Badge tone={ESTADO_MOV_TONE[detalle.estado]}>{detalle.estado}</Badge>
            </div>
          </div>

          <div className="pb-5 border-b">
            <div className="text-xs text-muted-foreground mb-1">TXID</div>
            <div className="font-mono text-sm font-medium break-all">{detalle.txid}</div>
          </div>

          <div className="pb-5 border-b">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Desde
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Nombre</div>
                <div className="font-medium truncate">{detalle.senderName}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">CUIT</div>
                <div className="font-mono text-xs">{detalle.senderCuit}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">CBU / CVU</div>
                <div className="font-mono text-xs truncate">{detalle.senderCbu}</div>
              </div>
            </div>
          </div>

          <div className="pb-5 border-b">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Hacia
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Nombre</div>
                <div className="font-medium truncate">{detalle.receiverName}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">CUIT</div>
                <div className="font-mono text-xs">{detalle.receiverCuit}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">CBU / CVU</div>
                <div className="font-mono text-xs truncate">{detalle.receiverCbu}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Banco</div>
                <div className="font-medium truncate">{detalle.receiverBanco || "—"}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm pb-2">
            <div>
              <div className="text-xs text-muted-foreground">N° de operacion</div>
              <div className="font-medium">{detalle.numeroOp}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Referencia</div>
              <div className="font-mono text-xs">{detalle.referencia}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Canal de origen</div>
              <div>{detalle.canal}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Usuario</div>
              <div>{detalle.usuario}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Subcuenta</div>
              <div>{detalle.subcuenta}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Categoria</div>
              <div>{detalle.categoria}</div>
            </div>
            {debitaCargos(detalle) && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground">Comisión</div>
                  <div className="font-mono">{formatMoney(detalle.comision)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">IVA</div>
                  <div className="font-mono">{formatMoney(detalle.impuesto)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Monto debitado</div>
                  <div className="font-mono font-semibold">
                    {formatMoney(montoDebitado(detalle))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <BtnPrimary className="flex-1" onClick={() => onDescargar(detalle)}>
              <Download size={15} /> Descargar comprobante
            </BtnPrimary>
            <BtnOutline className="flex-1" onClick={() => onCompartir(detalle)}>
              <Share2 size={15} /> Compartir comprobante
            </BtnOutline>
          </div>
        </div>
      </div>
    </div>
  );
}
