import type { ReactNode } from "react";
import { Card } from "@/components/portal-shell";

export function CenterCard({ children }: { children: ReactNode }) {
  return (
    <Card className="p-8 shadow-xl border-0 flex flex-col items-center text-center mx-auto max-w-md w-full">
      {children}
    </Card>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {/* `break-all` porque los valores son ids: en pantallas angostas un
          comprobante o un codigo de operacion no tienen donde cortar. */}
      <span className="font-semibold font-mono text-right break-all min-w-0">{value}</span>
    </div>
  );
}
