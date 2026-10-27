import { useEffect, useRef, useState } from "react";
import { Camera, FileText, UploadCloud, X } from "lucide-react";
import { esImagen } from "../utils";

export function FileUpload({
  label,
  hint,
  value,
  onChange,
  accept = "image/*,application/pdf",
}: {
  label: string;
  hint?: string;
  value: { name: string; url?: string; file?: File } | null | undefined;
  onChange: (f: { name: string; url: string; file?: File } | null) => void;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handle = (file: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("El archivo supera el máximo de 8 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    onChange({ name: file.name, url, file });
  };

  useEffect(() => {
    return () => {
      if (value?.url && value.url.startsWith("blob:")) URL.revokeObjectURL(value.url);
    };
  }, [value?.url]);

  const isImage = esImagen(value);
  const isExisting = !!value?.url && !value?.file;

  if (value) {
    return (
      <div>
        <span className="block mb-1.5 text-xs font-semibold text-black-700">{label}</span>
        <div className="flex items-center gap-3 bg-white px-3 py-3 rounded-sm border border-black-100">
          {isImage ? (
            <img
              src={value.url}
              alt={value.name}
              className="w-12 h-12 rounded-sm object-cover shrink-0 bg-black-50 ring-1 ring-black-100"
            />
          ) : (
            <FileText size={18} className="text-black-400 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate text-black-700">
              {isImage ? "Imagen cargada" : "Documento cargado"}{" "}
              {isExisting && <span className="text-[10px] text-black-400">(existente)</span>}
            </p>
            <p className="text-[11px] text-black-400">
              {isExisting ? "Se mantendrá si no la reemplazás" : "Listo para enviar"}
            </p>
            <p className="text-[11px] text-black-400 truncate">{value.name}</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs font-semibold text-black-700 hover:text-primary-ink transition-colors"
          >
            Reemplazar
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-black-400 hover:text-danger-500"
            aria-label="Quitar"
          >
            <X size={16} />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handle(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="block mb-1.5 text-xs font-semibold text-black-700">{label}</span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`w-full flex flex-col items-center justify-center gap-2 py-8 px-4 text-center transition-colors rounded-sm ${
          drag ? "border-primary-500 bg-primary-50/20" : "border-black-200 bg-white"
        } border-dashed border`}
      >
        <div className="w-10 h-10 flex items-center justify-center bg-black text-primary-400 rounded-full">
          <Camera size={18} />
        </div>
        <span className="text-sm font-semibold text-black-700">
          <UploadCloud size={14} className="inline mr-1" />
          Arrastrá o hacé clic para subir
        </span>
        {hint && <span className="text-xs text-black-400">{hint}</span>}
        <span className="text-[10px] text-black-300 uppercase tracking-wider">
          JPG · PNG · PDF · máx 8MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
