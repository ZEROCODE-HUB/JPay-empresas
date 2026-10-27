import type { SectionTab, Tab } from "../types";

/** Tabs principales: Servicios / Remesas. */
export function ServiciosTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 mb-6 border-b">
      {(
        [
          ["servicios", "Servicios"],
          ["remesas", "Remesas y crossborder"],
        ] as Array<[Tab, string]>
      ).map(([k, l]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
            tab === k
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Sub-secciones del tab Servicios, con la cantidad de cada una. */
export function SeccionesServicios({
  sectionTab,
  onChange,
  counts,
}: {
  sectionTab: SectionTab;
  onChange: (s: SectionTab) => void;
  counts: Record<SectionTab, number>;
}) {
  return (
    <div className="flex gap-1 mb-5 bg-muted/50 p-1 rounded-lg">
      {(
        [
          ["proximos", `Proximos pagos (${counts.proximos})`],
          ["suscritos", `Suscritos (${counts.suscritos})`],
          ["disponibles", `Disponibles (${counts.disponibles})`],
          ["historial", `Historial (${counts.historial})`],
        ] as Array<[SectionTab, string]>
      ).map(([k, l]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`flex-1 px-3 py-2 text-sm font-semibold rounded-md transition ${
            sectionTab === k
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
