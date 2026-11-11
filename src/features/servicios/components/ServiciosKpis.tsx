import { formatMoney } from "@/shared/format";
import { KpiServicio } from "./comunes";
import { brand } from "@/brand/brand";

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
      <KpiServicio
        label="Servicios adheridos"
        value={totalAdheridos}
        info={`Servicios que tienes adheridos para pagar desde ${brand.name}.`}
      />
      <KpiServicio
        label="A pagar este mes"
        value={formatMoney(totalPagarMes)}
        nota={`${cantFacturas} factura(s)`}
        info="Suma de los importes de la lista «Próximos vencimientos», con el filtro de categoría que elegiste."
        infoAlign="right"
      />
      <KpiServicio
        label="Vencidos"
        value={totalVencidos}
        info="Servicios de esa lista cuya fecha de vencimiento ya pasó."
      />
      <KpiServicio
        label="Disponibles para suscribir"
        value={cantDisponibles}
        info="Servicios del catálogo a los que todavía no te adheriste."
        infoAlign="right"
      />
    </div>
  );
}
