import { Trash2 } from "lucide-react";
import { BtnOutline, BtnPrimary } from "@/components/portal-shell";

export function EliminarPdvDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg max-w-sm w-full p-6 shadow-xl text-center">
        <Trash2 size={28} className="mx-auto text-danger-500 mb-3" />
        <h3 className="font-semibold text-base mb-2">¿Eliminar punto de venta?</h3>
        <p className="text-sm text-muted-foreground mb-6">Esta acción no se puede deshacer.</p>
        <div className="flex gap-3 justify-center">
          <BtnOutline onClick={onClose}>Cancelar</BtnOutline>
          <BtnPrimary className="bg-danger-600 hover:bg-danger-700" onClick={onConfirm}>
            Eliminar
          </BtnPrimary>
        </div>
      </div>
    </div>
  );
}
