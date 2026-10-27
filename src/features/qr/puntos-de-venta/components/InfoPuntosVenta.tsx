import { Info } from "lucide-react";

/** Banner azul explicando para qué sirven los puntos de venta. */
export function InfoPuntosVenta() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
      <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-blue-800">Información sobre Puntos de Venta</p>
        <p className="text-xs text-blue-700 mt-1 leading-relaxed">
          Los puntos de venta permiten identificar y gestionar los cobros realizados dentro de una
          misma entidad.
        </p>
        <p className="text-xs text-blue-700 mt-1 leading-relaxed">
          Si necesita separar la operación por una unidad de negocio distinta, se recomienda crear
          una subcuenta y habilitar el cobro con QR en dicha subcuenta.
        </p>
      </div>
    </div>
  );
}
