import { Download, Edit3, Printer, X } from "lucide-react";
import { Badge, BtnOutline, BtnPrimary } from "@/components/portal-shell";
import type { PuntoVenta } from "@/lib/api/qr";
import { formatDate } from "@/shared/format";
import { tonoEstadoPdv } from "../estados";

/** Modal con los datos del punto de venta, su QR y acciones de descarga/impresión. */
export function DetallePdvDialog({
  pdv,
  qrDataUrl,
  onClose,
  onEditar,
}: {
  pdv: PuntoVenta;
  qrDataUrl: string;
  onClose: () => void;
  onEditar: () => void;
}) {
  const descargar = () => {
    if (qrDataUrl) {
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = `qr-${pdv.id}.png`;
      a.click();
    }
  };

  const imprimir = () => {
    if (qrDataUrl) {
      const w = window.open();
      if (w) {
        // Sin noopener porque hay que escribir en la ventana: se corta el acceso a esta.
        w.opener = null;
        w.document.write(`<img src="${qrDataUrl}" onload="window.print()" />`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg max-w-lg w-full p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X size={16} />
        </button>
        <h3 className="font-semibold text-lg mb-4">{pdv.nombre}</h3>

        <div className="grid grid-cols-[1fr_auto] gap-6">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado</span>
              <Badge tone={tonoEstadoPdv(pdv.estado)}>{pdv.estado}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha de creación</span>
              <span className="font-semibold">{formatDate(pdv.created_at)}</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="border-2 rounded-xl p-2 bg-white">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR" className="w-32 h-32" />
              ) : (
                <div className="w-32 h-32 bg-muted animate-pulse rounded" />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              Escaneá para pagar en
              <br />
              {pdv.nombre}
            </span>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <BtnOutline className="flex-1 h-9 text-xs" onClick={onClose}>
            Cerrar
          </BtnOutline>
          <BtnOutline className="h-9 text-xs" onClick={descargar}>
            <Download size={13} /> QR
          </BtnOutline>
          <BtnOutline className="h-9 text-xs" onClick={imprimir}>
            <Printer size={13} />
          </BtnOutline>
          <BtnPrimary className="flex-1 h-9 text-xs" onClick={onEditar}>
            <Edit3 size={13} /> Editar
          </BtnPrimary>
        </div>
      </div>
    </div>
  );
}
