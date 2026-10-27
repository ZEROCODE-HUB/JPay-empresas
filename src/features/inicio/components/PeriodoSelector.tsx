import { FileSpreadsheet, FileText } from "lucide-react";
import { BtnOutline, Card } from "@/components/portal-shell";
import type { PeriodoDashboard } from "../hooks/usePeriodoDashboard";
import { QUICK, type PeriodKey } from "../utils";

const BOTONES: Array<{ k: PeriodKey; l: string }> = [
  ...QUICK,
  { k: "day", l: "Día específico" },
  { k: "range", l: "Rango" },
];

const CLASE_FECHA = "h-9 px-3 rounded-sm border border-black-100 bg-white text-sm text-black-700";

function CampoFecha({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-black-400">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        className={CLASE_FECHA}
      />
    </div>
  );
}

type Props = { p: PeriodoDashboard; onExport: (fmt: "xlsx" | "pdf") => void };

export function PeriodoSelector({ p, onExport }: Props) {
  return (
    <Card className="mb-8">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-black-400 uppercase tracking-wide shrink-0">
          Período
        </span>
        {BOTONES.map((b) => (
          <button
            key={b.k}
            onClick={() => p.setPeriod(b.k)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              p.period === b.k
                ? "bg-secondary-50 text-secondary-600 border-transparent"
                : "bg-white hover:bg-black-50 border-black-100 text-black-500"
            }`}
          >
            {b.l}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <CampoFecha label="Día" value={p.day} onChange={p.setDay} />
        <CampoFecha label="Desde" value={p.desde} onChange={p.setDesde} />
        <CampoFecha
          label="Hasta"
          value={p.hasta}
          onChange={p.setHasta}
          min={p.desde || undefined}
        />
        <div className="ml-auto flex gap-2">
          <BtnOutline onClick={() => onExport("xlsx")}>
            <FileSpreadsheet size={14} /> Excel
          </BtnOutline>
          <BtnOutline onClick={() => onExport("pdf")}>
            <FileText size={14} /> PDF
          </BtnOutline>
        </div>
      </div>
    </Card>
  );
}
