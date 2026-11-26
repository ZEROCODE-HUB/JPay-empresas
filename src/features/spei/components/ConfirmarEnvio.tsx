import type { ReactNode } from "react";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

/**
 * Resumen antes de mover dinero (SPEI, lote o dólares): el envío sale solo después de que el
 * usuario revisa destinatario, monto y comisión y confirma.
 */
export function ConfirmarEnvio({
  open,
  onClose,
  onConfirm,
  titulo,
  filas,
  aviso,
  confirmLabel = "Confirmar y enviar",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  titulo: string;
  filas: Array<[string, ReactNode]>;
  aviso?: ReactNode;
  confirmLabel?: string;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={titulo}
      confirmLabel={confirmLabel}
      message={
        <>
          <dl className="space-y-2">
            {filas.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-black-400">{k}</dt>
                <dd className="text-right font-medium text-foreground break-all">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs">
            {aviso ?? "Revisa los datos: una transferencia enviada no se puede cancelar."}
          </p>
        </>
      }
    />
  );
}
