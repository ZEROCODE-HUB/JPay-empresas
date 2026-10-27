import type { ReactNode } from "react";
import { formatMoney } from "@/shared/format";
import type { Tab } from "../types";

function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
        {value}
      </div>
      {sub}
    </div>
  );
}

/** Tarjetas de arriba: disponible, enviado en el mes, programadas y subcuentas. */
export function ResumenTransferencias({
  totalDisponible,
  subcuentas,
  enviadoMes,
  programadas,
}: {
  totalDisponible: number;
  subcuentas: number;
  enviadoMes: { monto: number; ops: number };
  programadas: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Kpi
        label="Disponible hoy"
        value={formatMoney(totalDisponible)}
        sub={
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {subcuentas} subcuentas
          </div>
        }
      />
      <Kpi
        label="Enviado este mes"
        value={formatMoney(enviadoMes.monto)}
        sub={
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {enviadoMes.ops} operaciones
          </div>
        }
      />
      <Kpi label="Programadas" value={programadas} />
      <Kpi
        label="Subcuentas"
        value={subcuentas}
        sub={<div className="text-[10px] text-muted-foreground mt-0.5">activas</div>}
      />
    </div>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: "unica", label: "Transferencia unica" },
  { key: "programar", label: "Programar" },
  { key: "borradores", label: "Borradores" },
  { key: "programadas", label: "Transferencias programadas" },
  { key: "destinatarios", label: "Destinatarios frecuentes" },
];

/** Panel con las pestañas a la izquierda (arriba en mobile) y el contenido. */
export function PanelTabs({
  tab,
  onTab,
  children,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  children: ReactNode;
}) {
  return (
    <div className="bg-card border rounded-lg mb-6 overflow-hidden">
      <div className="md:grid md:grid-cols-[220px_1fr]">
        <nav className="flex md:flex-col overflow-x-auto overflow-y-hidden md:overflow-visible border-b md:border-b-0 md:border-r bg-muted/10">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onTab(t.key)}
              className={`shrink-0 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 md:border-b-0 md:border-l-2 md:text-left transition-colors ${
                tab === t.key
                  ? "border-primary text-primary-ink bg-[color:var(--brand-primary-50)]/50 md:bg-[color:var(--brand-primary-50)]/40"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
