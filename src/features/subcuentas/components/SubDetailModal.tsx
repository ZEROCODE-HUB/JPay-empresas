import { X } from "lucide-react";
import { useDetalleSubcuenta } from "../hooks/useDetalleSubcuenta";
import type { EstadoSub, Sub } from "../types";
import { DetalleFinanciera } from "./DetalleFinanciera";
import { DetalleInfoGeneral } from "./DetalleInfoGeneral";
import { DetalleMovimientos } from "./DetalleMovimientos";

type Props = {
  sub: Sub;
  onClose: () => void;
  onCambiarEstado: (id: string, estado: EstadoSub) => void;
  onGuardarEmail: (id: string, email: string) => Promise<boolean>;
  onFondear: () => void;
  onVerHistorial: () => void;
};

export function SubDetailModal({
  sub,
  onClose,
  onCambiarEstado,
  onGuardarEmail,
  onFondear,
  onVerHistorial,
}: Props) {
  const d = useDetalleSubcuenta(sub);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-card w-full sm:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col shadow-xl rounded-t-xl sm:rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b px-5 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <h2 className="text-base font-semibold">Detalles de Subcuenta</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-7">
          <DetalleInfoGeneral
            sub={sub}
            d={d}
            onCambiarEstado={onCambiarEstado}
            onGuardarEmail={onGuardarEmail}
          />
          <DetalleFinanciera
            sub={sub}
            totalDepositos={d.totalDepositos}
            totalRetiros={d.totalRetiros}
            onFondear={onFondear}
          />
          <DetalleMovimientos sub={sub} d={d} onVerHistorial={onVerHistorial} />
        </div>
      </div>
    </div>
  );
}
