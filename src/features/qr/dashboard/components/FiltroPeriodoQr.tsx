import { Download, FileSpreadsheet } from "lucide-react";
import { BtnOutline } from "@/components/portal-shell";
import { PRESETS } from "../utils";

/** Period filter + export */
export function FiltroPeriodoQr({
  presetLabel,
  setPresetLabel,
  exportExcel,
  exportPDF,
}: {
  presetLabel: string;
  setPresetLabel: (l: string) => void;
  exportExcel: () => void;
  exportPDF: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {PRESETS.map((p) => (
        <button
          key={p.days}
          onClick={() => setPresetLabel(p.label)}
          className={
            "px-4 py-2 rounded-lg text-xs font-semibold border transition " +
            (presetLabel === p.label
              ? "bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)] border-transparent"
              : "bg-card hover:bg-muted")
          }
        >
          {p.label}
        </button>
      ))}
      <div className="flex-1" />
      <BtnOutline className="h-9 px-3 text-xs" onClick={exportExcel}>
        <FileSpreadsheet size={14} /> Excel
      </BtnOutline>
      <BtnOutline className="h-9 px-3 text-xs" onClick={exportPDF}>
        <Download size={14} /> PDF
      </BtnOutline>
    </div>
  );
}
