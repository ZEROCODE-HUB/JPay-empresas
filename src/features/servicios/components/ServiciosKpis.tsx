import { formatMoney } from "@/shared/format";
import { KpiServicio } from "./comunes";

export function ServiciosKpis({
  totalAdheridos,
  totalPagarMes,
  cantFacturas,
  totalVencidos,
  cantDisponibles,
}: {
  totalAdheridos: number;
  totalPagarMes: number;
  cantFacturas: number;
  totalVencidos: number;
  cantDisponibles: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <KpiServicio label="Servicios adheridos" value={totalAdheridos} />
      <KpiServicio
        label="A pagar este mes"
        value={formatMoney(totalPagarMes)}
        nota={`${cantFacturas} factura(s)`}
      />
      <KpiServicio label="Vencidos" value={totalVencidos} />
      <KpiServicio label="Disponibles para suscribir" value={cantDisponibles} />
    </div>
  );
}
