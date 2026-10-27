import { useEffect, useRef, useState } from "react";
import { BtnOutline, BtnPrimary, Input } from "@/components/portal-shell";

/** Lector de código de barras con la cámara (BarcodeDetector) y alternativa de ingreso manual. */
export function BarcodeScanModal({
  open,
  onClose,
  onDetect,
}: {
  open: boolean;
  onClose: () => void;
  onDetect: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const BD = (
          window as unknown as {
            BarcodeDetector?: new () => {
              detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
            };
          }
        ).BarcodeDetector;
        if (BD) {
          const detector = new BD();
          const tick = async () => {
            if (!videoRef.current || cancelled) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes && codes.length) {
                onDetect(codes[0].rawValue);
                onClose();
                return;
              }
            } catch {
              /* ignore */
            }
            if (!cancelled) setTimeout(tick, 500);
          };
          tick();
        }
      } catch {
        /* camara no disponible: el usuario usa el ingreso manual */
      }
    };
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetect, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card rounded-xl max-w-md w-full p-4 shadow-2xl space-y-3">
        <div className="font-semibold">Escanear codigo de barra</div>
        <video
          ref={videoRef}
          className="w-full rounded-md bg-black aspect-video"
          muted
          playsInline
        />
        <p className="text-xs text-muted-foreground">
          Apunta la camara al codigo. Si no se detecta, ingresa el numero manualmente.
        </p>
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Numero manual"
        />
        <div className="flex gap-2">
          <BtnOutline className="flex-1" onClick={onClose}>
            Cancelar
          </BtnOutline>
          <BtnPrimary
            className="flex-1"
            onClick={() => {
              if (manual.trim()) {
                onDetect(manual.trim());
                onClose();
              }
            }}
          >
            Usar numero
          </BtnPrimary>
        </div>
      </div>
    </div>
  );
}
