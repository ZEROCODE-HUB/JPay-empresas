import type { ReactNode } from "react";

export type Col = { label: string; align?: "left" | "right" | "center" };

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** Tabla con el estilo de los tabs de liquidaciones (cabecera gris, filas divididas). */
export function TablaLiquidaciones({
  cols,
  vacio,
  children,
}: {
  cols: Col[];
  /** Mensaje a mostrar en lugar de las filas; `null` si hay filas. */
  vacio: string | null;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            {cols.map((c) => (
              <th key={c.label} className={`${ALIGN[c.align ?? "left"]} px-5 py-3`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {vacio !== null ? (
            <tr>
              <td
                colSpan={cols.length}
                className="px-5 py-10 text-center text-sm text-muted-foreground"
              >
                {vacio}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
