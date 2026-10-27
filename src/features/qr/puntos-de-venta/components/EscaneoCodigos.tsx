import { ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { BtnPrimary, Card } from "@/components/portal-shell";

/** Tarjeta "Escaneo de codigos" con su botón para abrir el modal. */
export function EscaneoCard({ onEscanear }: { onEscanear: () => void }) {
  return (
    <Card className="mb-6 flex flex-wrap items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)] flex items-center justify-center">
        <ScanLine size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold">Escaneo de codigos</div>
        <div className="text-xs text-muted-foreground">
          Para realizar pagos en comercios, profesionales, etc. Escanea el codigo de barras o QR
          desde tu camara.
        </div>
      </div>
      <BtnPrimary className="h-9 px-4 text-xs" onClick={onEscanear}>
        <ScanLine size={14} /> Escanear
      </BtnPrimary>
    </Card>
  );
}

/** Modal que pide permiso de cámara para escanear. */
export function EscanearDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  const abrirCamara = () => {
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
          toast.success("Camara lista para escanear");
          onClose();
        })
        .catch(() => toast.error("No se pudo acceder a la camara"));
    } else {
      toast.error("Este dispositivo no soporta camara");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-xl max-w-md w-full shadow-2xl">
        <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center rounded-t-xl">
          <div className="font-semibold">Escanear codigo</div>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-accent transition"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-center w-full h-48 rounded-lg bg-muted/40 border border-dashed">
            <ScanLine size={48} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Apunta la camara al codigo de barras o QR del comercio para iniciar el pago.
          </p>
          <BtnPrimary className="w-full" onClick={abrirCamara}>
            <ScanLine size={15} /> Abrir camara
          </BtnPrimary>
        </div>
      </div>
    </div>
  );
}
