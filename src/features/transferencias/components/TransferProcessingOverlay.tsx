import { Check, Loader2, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/shared/format";

// Overlay mientras se procesa la transferencia.

export type PasoTransferencia = "reserva" | "envio" | "confirmacion";

const PASOS: { key: PasoTransferencia; label: string }[] = [
  { key: "reserva", label: "Reservando fondos" },
  { key: "envio", label: "Enviando al banco" },
  { key: "confirmacion", label: "Confirmando la operación" },
];

export function TransferProcessingOverlay({
  paso,
  monto,
}: {
  paso: PasoTransferencia;
  monto?: number;
}) {
  const actual = PASOS.findIndex((p) => p.key === paso);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="alertdialog"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-2xl bg-card p-7 shadow-2xl text-center">
        <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-[color:var(--brand-soft)] flex items-center justify-center">
          <Loader2 size={30} className="animate-spin text-[color:var(--brand-primary)]" />
        </div>
        <div className="text-lg font-semibold">Procesando transferencia</div>
        {monto != null && (
          <div className="mt-1 font-display tabular-nums text-2xl font-bold">
            {formatMoney(monto)}
          </div>
        )}
        <ol className="mt-6 space-y-3 text-left">
          {PASOS.map((p, i) => {
            const hecho = i < actual;
            const enCurso = i === actual;
            return (
              <li key={p.key} className="flex items-center gap-3 text-sm">
                <span
                  className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center border ${
                    hecho
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : enCurso
                        ? "border-[color:var(--brand-primary)]"
                        : "border-muted-foreground/30"
                  }`}
                >
                  {hecho ? (
                    <Check size={14} />
                  ) : enCurso ? (
                    <Loader2 size={13} className="animate-spin text-[color:var(--brand-primary)]" />
                  ) : null}
                </span>
                <span
                  className={
                    hecho
                      ? "text-muted-foreground"
                      : enCurso
                        ? "font-semibold"
                        : "text-muted-foreground/70"
                  }
                >
                  {p.label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck size={13} /> No cierres ni recargues esta ventana.
        </div>
      </div>
    </div>
  );
}
