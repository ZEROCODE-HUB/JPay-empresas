import type { ReactNode } from "react";
import { Card } from "@/components/portal-shell";

/** Card "Registros del lote" con su cabecera; la tabla (y la paginación) van como children. */
export function RegistrosCard({ total, children }: { total: number; children: ReactNode }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <div className="font-semibold">Registros del lote</div>
          <div className="text-xs text-muted-foreground">{total} registros</div>
        </div>
      </div>
      {children}
    </Card>
  );
}
