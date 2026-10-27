import { Copy, Edit3, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnOutline } from "@/components/portal-shell";
import type { PaymentLink } from "@/data/links-pago";
import { formatMoney } from "@/shared/format";
import { toneEstadoLink } from "../estados";
import { codigoLink, linkDisplayStatus, montoProductos } from "../utils";

const copiar = (url: string) => {
  navigator.clipboard.writeText(url);
  toast.success("Link copiado");
};

/** Modal con el detalle de un link de pago. */
export function LinkDetailDialog({
  link,
  banderas,
  onClose,
  onEditar,
}: {
  link: PaymentLink;
  /** Nombres de las banderas activas del comercio del link. */
  banderas: string[];
  onClose: () => void;
  onEditar: () => void;
}) {
  const estado = linkDisplayStatus(link);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10">
          <div className="font-semibold">Detalle del link de pago</div>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-accent transition"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="font-mono text-sm break-all p-3 bg-muted rounded">{link.url}</div>
          <div className="flex gap-2">
            <BtnOutline className="flex-1 text-xs" onClick={() => copiar(link.url)}>
              <Copy size={13} /> Copiar enlace
            </BtnOutline>
            <BtnOutline className="flex-1 text-xs" onClick={onEditar}>
              <Edit3 size={13} /> Editar
            </BtnOutline>
            <BtnOutline
              className="flex-1 text-xs"
              onClick={() => {
                if (navigator.share) navigator.share({ url: link.url }).catch(() => {});
                else copiar(link.url);
              }}
            >
              <Share2 size={13} /> Compartir
            </BtnOutline>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">ID</span>
              <div className="font-mono">{codigoLink(link)}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Estado</span>
              <div>
                <Badge tone={toneEstadoLink(estado)}>{estado}</Badge>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Monto total</span>
              <div className="font-semibold">
                {formatMoney(montoProductos(link.products), { decimals: 0 })}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Pagos</span>
              <div>{link.payments}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Creado</span>
              <div>{link.createdAt}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Expira</span>
              <div>{link.expiresAt || "N/A"}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Comercio</span>
              <div className="font-semibold">{link.comercioNombre || "-"}</div>
            </div>
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground">Metodos de pago</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {banderas.length > 0 ? (
                  banderas.map((b, i) => (
                    <Badge key={i} tone="neutral">
                      {b}
                    </Badge>
                  ))
                ) : link.methods.length > 0 ? (
                  link.methods.map((m, i) => (
                    <Badge key={i} tone="neutral">
                      {m}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground text-xs">Sin metodos de pago</span>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground">Productos</span>
              <div className="font-semibold">{link.products.map((p) => p.name).join(", ")}</div>
            </div>
            {link.reference && (
              <div className="col-span-2">
                <span className="text-xs text-muted-foreground">Referencia</span>
                <div>{link.reference}</div>
              </div>
            )}
            {link.notes && (
              <div className="col-span-2">
                <span className="text-xs text-muted-foreground">Observaciones</span>
                <div>{link.notes}</div>
              </div>
            )}
            <div>
              <span className="text-xs text-muted-foreground">Pagos parciales</span>
              <div>{link.partialPayments ? "Si" : "No"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
