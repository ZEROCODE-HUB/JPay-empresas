import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";
import { BtnOutline, BtnPrimary, Card, PageHeader } from "@/components/portal-shell";
import { useLiquidaciones } from "@/hooks/useLiquidaciones";
import { AcreditacionesTab } from "@/features/liquidaciones/components/AcreditacionesTab";
import { CalendarioTab } from "@/features/liquidaciones/components/CalendarioTab";
import { ComisionesTab } from "@/features/liquidaciones/components/ComisionesTab";
import { DetalleTicketDialog } from "@/features/liquidaciones/components/DetalleTicketDialog";
import { ImpuestosCard } from "@/features/liquidaciones/components/ImpuestosCard";
import { LiquidacionesKpis } from "@/features/liquidaciones/components/LiquidacionesKpis";
import { LiquidacionesTabsHeader } from "@/features/liquidaciones/components/LiquidacionesTabsHeader";
import { LotesVentaTab } from "@/features/liquidaciones/components/LotesVentaTab";
import { SolicitarAdelantoDialog } from "@/features/liquidaciones/components/SolicitarAdelantoDialog";
import { TicketsTab } from "@/features/liquidaciones/components/TicketsTab";
import { exportarResumenExcel, exportarResumenPdf } from "@/features/liquidaciones/export";
import { useDetalleTicket } from "@/features/liquidaciones/hooks/useDetalleTicket";
import { useSolicitudAdelanto } from "@/features/liquidaciones/hooks/useSolicitudAdelanto";
import { useTabsLiquidaciones } from "@/features/liquidaciones/hooks/useTabsLiquidaciones";

export const Route = createFileRoute("/app/liquidaciones")({ component: Liquidaciones });

function Liquidaciones() {
  const { comercioId, datos, isLoading: loading, actualizarDatos } = useLiquidaciones();
  const tabs = useTabsLiquidaciones(datos);
  const solicitud = useSolicitudAdelanto(datos, actualizarDatos);
  const detalle = useDetalleTicket(actualizarDatos);

  return (
    <>
      <PageHeader
        title="Liquidaciones"
        description="Cuánta plata te falta cobrar, cuánto tenés por acreditar y calendario de acreditaciones. Solicitá el adelanto ahí mismo."
        action={
          <div className="flex gap-2">
            <BtnOutline
              onClick={() => {
                exportarResumenExcel(datos);
                toast.success("Excel descargado");
              }}
            >
              <FileSpreadsheet size={14} /> Excel
            </BtnOutline>
            <BtnOutline
              onClick={() => {
                exportarResumenPdf(datos);
                toast.success("PDF descargado");
              }}
            >
              <Download size={14} /> PDF
            </BtnOutline>
            <BtnPrimary onClick={solicitud.openGeneral}>
              <Plus size={14} /> Solicitar adelanto
            </BtnPrimary>
          </div>
        }
      />

      <LiquidacionesKpis loading={loading} {...datos} />

      <Card className="mb-6 p-0">
        <LiquidacionesTabsHeader
          activeTab={tabs.activeTab}
          onChange={tabs.setActiveTab}
          cantTickets={datos.tickets.length}
          cantAcreditados={datos.lotesAcreditados.length}
          cantLotesVenta={datos.lotesVenta.length}
        />
        {tabs.activeTab === "calendario" && (
          <CalendarioTab
            comercioId={comercioId}
            loading={loading}
            tickets={datos.tickets}
            onSelectDate={solicitud.elegirDia}
            onOpenGeneral={solicitud.openGeneral}
            onOpenDetalle={detalle.setDetalle}
          />
        )}
        {tabs.activeTab === "tickets" && (
          <TicketsTab
            pag={tabs.tickets}
            onNuevo={solicitud.openGeneral}
            onVer={detalle.setDetalle}
          />
        )}
        {tabs.activeTab === "acreditaciones" && (
          <AcreditacionesTab lotes={datos.lotesAcreditados} pag={tabs.acreditados} />
        )}
        {tabs.activeTab === "lotes-venta" && <LotesVentaTab pag={tabs.lotesVenta} />}
        {tabs.activeTab === "comisiones" && <ComisionesTab comisiones={datos.comisiones} />}
      </Card>

      <ImpuestosCard impuestos={datos.impuestos} excepciones={datos.excepciones} />

      <SolicitarAdelantoDialog
        s={solicitud}
        dias={datos.dias}
        tickets={datos.tickets}
        porAcreditar={datos.porAcreditar}
        disponible={datos.disponible}
      />

      <DetalleTicketDialog
        ticket={detalle.detalle}
        saving={detalle.saving}
        onClose={() => detalle.setDetalle(null)}
        onCancelar={detalle.cancelar}
      />
    </>
  );
}
