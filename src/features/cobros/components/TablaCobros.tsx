import type { ReactNode } from "react";

export type ColCobros = { label: string; align?: "left" | "right" | "center" };

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** Tabla con el estilo de los listados de lotes (cabecera gris en mayúsculas, filas divididas). */
export function TablaCobros({
  cols,
  vacio,
  cargando = false,
  children,
}: {
  cols: ColCobros[];
  /** Mientras carga: filas grises animadas en vez de "No hay registros.". */
  cargando?: boolean;
  /** Si es true agrega la fila "No hay registros." al final. */
  vacio: boolean;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {cols.map((c) => (
              <th
                key={c.label}
                className={`${ALIGN[c.align ?? "left"]} px-5 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {cargando &&
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={cols.length} className="px-5 py-3">
                  <div
                    role="status"
                    aria-label="Cargando"
                    className="h-6 rounded bg-muted animate-pulse"
                  />
                </td>
              </tr>
            ))}
          {!cargando && children}
          {!cargando && vacio && (
            <tr>
              <td
                colSpan={cols.length}
                className="px-5 py-8 text-center text-sm text-muted-foreground"
              >
                No hay registros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Barra de progreso + porcentaje de una fila de lote. */
export function ProgresoLote({
  progreso,
  ancho,
}: {
  progreso: number;
  /** `fijo`: barra de ancho fijo (gestión); `flexible`: ocupa el espacio hasta 100px (dashboard). */
  ancho: "fijo" | "flexible";
}) {
  const flexible = ancho === "flexible";
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${flexible ? "flex-1 max-w-[100px]" : "w-16"} h-2 rounded-full bg-muted overflow-hidden`}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${progreso}%` }} />
      </div>
      <span className={`text-xs font-semibold${flexible ? " min-w-[3rem]" : ""}`}>{progreso}%</span>
    </div>
  );
}
