import { Download, FileSpreadsheet } from "lucide-react";
import { BtnOutline, Input, Label } from "@/components/portal-shell";

const PRESETS = [
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "60 dias", days: 60 },
  { label: "90 dias", days: 90 },
  { label: "Todos", days: 9999 },
];

/** Presets de período, rango personalizado y botones de exportación. */
export function DashboardFiltros({
  periodo,
  onPreset,
  desde,
  hasta,
  onDesde,
  onHasta,
  onExcel,
  onPdf,
}: {
  periodo: string;
  onPreset: (label: string, days: number) => void;
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  onExcel: () => void;
  onPdf: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {PRESETS.map((p) => (
        <button
          key={p.days}
          onClick={() => onPreset(p.label, p.days)}
          className={
            "px-4 py-2 rounded-lg text-xs font-semibold border transition " +
            (periodo === p.label
              ? "bg-secondary-50 text-secondary-600 border-transparent"
              : "bg-card hover:bg-muted")
          }
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-2 ml-auto">
        <div className="flex items-center gap-1.5">
          <Label>Desde</Label>
          <Input
            type="date"
            value={desde}
            onChange={(e) => onDesde(e.target.value)}
            className="h-9 w-36 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Label>Hasta</Label>
          <Input
            type="date"
            value={hasta}
            onChange={(e) => onHasta(e.target.value)}
            className="h-9 w-36 text-xs"
          />
        </div>
      </div>
      <BtnOutline className="h-9 px-3 text-xs" onClick={onExcel}>
        <FileSpreadsheet size={14} /> Excel
      </BtnOutline>
      <BtnOutline className="h-9 px-3 text-xs" onClick={onPdf}>
        <Download size={14} /> PDF
      </BtnOutline>
    </div>
  );
}
