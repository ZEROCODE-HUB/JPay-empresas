import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, FileSpreadsheet, FileText, Percent } from "lucide-react";
import type { TabSeccion } from "../hooks/useTabsLiquidaciones";

const CONTADOR_NEUTRO = "bg-muted";
const CONTADOR_OK = "bg-emerald-100 text-emerald-700";

/** Barra de tabs de la sección principal, con contadores. */
export function LiquidacionesTabsHeader({
  activeTab,
  onChange,
  cantTickets,
  cantAcreditados,
  cantLotesVenta,
}: {
  activeTab: TabSeccion;
  onChange: (t: TabSeccion) => void;
  cantTickets: number;
  cantAcreditados: number;
  cantLotesVenta: number;
}) {
  const tabs: { id: TabSeccion; icon: ReactNode; label: string; n?: number; tono?: string }[] = [
    { id: "calendario", icon: <CalendarDays size={15} />, label: "Calendario de acreditaciones" },
    { id: "tickets", icon: <FileText size={15} />, label: "Tickets de adelanto", n: cantTickets },
    {
      id: "acreditaciones",
      icon: <CheckCircle2 size={15} />,
      label: "Acreditaciones",
      n: cantAcreditados,
      tono: CONTADOR_OK,
    },
    {
      id: "lotes-venta",
      icon: <FileSpreadsheet size={15} />,
      label: "Lotes de venta",
      n: cantLotesVenta,
    },
    { id: "comisiones", icon: <Percent size={15} />, label: "Comisiones" },
  ];
  return (
    <div className="flex border-b">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === t.id
              ? "border-b-2 border-primary text-primary-ink bg-muted/30"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
          }`}
        >
          {t.icon} {t.label}
          {!!t.n && t.n > 0 && (
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-full ${t.tono ?? CONTADOR_NEUTRO} text-[10px] font-semibold`}
            >
              {t.n}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
