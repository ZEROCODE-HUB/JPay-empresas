import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import { BtnOutline } from "@/components/portal-shell";

export type DocPreviewData = {
  tipo: string;
  label: string;
  signedUrl: string | null;
  kind: "image" | "pdf" | "file";
};

export function DocPreviewModal({ doc, onClose }: { doc: DocPreviewData | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [doc?.signedUrl]);

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card rounded-lg max-w-2xl w-full shadow-xl overflow-hidden">
        <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10">
          <div className="min-w-0">
            <div className="font-semibold truncate">{doc.tipo}</div>
            <div className="text-xs text-muted-foreground truncate">{doc.label}</div>
          </div>
          <div className="flex gap-1 items-center shrink-0">
            {doc.signedUrl && (
              <BtnOutline className="h-9 px-3 text-xs" onClick={() => window.open(doc.signedUrl!, "_blank")}>
                <Download size={12} /> Descargar
              </BtnOutline>
            )}
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-md" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="relative h-[60vh] flex items-center justify-center bg-neutral-800 p-2">
          {!doc.signedUrl ? (
            <p className="text-neutral-300 text-sm text-center px-6">No se pudo generar la vista previa.</p>
          ) : doc.kind === "image" ? (
            <>
              {!loaded && <div className="absolute w-40 h-52 rounded-md bg-neutral-700 animate-pulse" />}
              <img
                src={doc.signedUrl}
                alt={doc.label}
                onLoad={() => setLoaded(true)}
                className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
              />
            </>
          ) : doc.kind === "pdf" ? (
            <>
              {!loaded && <div className="absolute w-40 h-52 rounded-md bg-neutral-700 animate-pulse" />}
              <iframe
                src={doc.signedUrl}
                title={doc.label}
                onLoad={() => setLoaded(true)}
                className={`w-full h-full border-0 bg-white transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
              />
            </>
          ) : (
            <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="text-neutral-200 underline">
              Abrir archivo
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
