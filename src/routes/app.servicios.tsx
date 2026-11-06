import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { Card, PageHeader } from "@/components/portal-shell";
import { BarcodeScanModal } from "@/features/servicios/components/BarcodeScanModal";
import { HistorialServicios } from "@/features/servicios/components/HistorialServicios";
import { ProximosPagos } from "@/features/servicios/components/ProximosPagos";
import {
  EditarServicioDialog,
  PagarServicioDialog,
} from "@/features/servicios/components/ServiciosDialogs";
import { ServiciosDisponibles } from "@/features/servicios/components/ServiciosDisponibles";
import { ServiciosKpis } from "@/features/servicios/components/ServiciosKpis";
import { ServiciosSuscritos } from "@/features/servicios/components/ServiciosSuscritos";
import { SeccionesServicios } from "@/features/servicios/components/ServiciosTabs";
import { usePantallaServicios } from "@/features/servicios/hooks/usePantallaServicios";
import { usePaisConModulos } from "@/shared/modulos-pais";
import { EmptyState } from "@/shared/ui/empty-state";

export const Route = createFileRoute("/app/servicios")({
  head: () => ({ meta: [{ title: "Pago de servicios" }] }),
  component: Page,
});

/** Se muestra solo con el módulo `servicios` prendido (todavía no tiene backend). */
function Page() {
  const pais = usePaisConModulos();
  if (!pais.modulos.servicios) {
    return (
      <>
        <PageHeader title="Pago de servicios" />
        <Card>
          <EmptyState
            icon={<Receipt size={48} strokeWidth={1.5} />}
            title="Pago de servicios todavía no está disponible"
            description="Te avisaremos cuando puedas pagar tus servicios desde tu cuenta."
          />
        </Card>
      </>
    );
  }
  return <PantallaServicios />;
}

function PantallaServicios() {
  const p = usePantallaServicios();

  return (
    <>
      <PageHeader
        title="Pago de servicios"
        description="Paga tus servicios y consulta el historial de operaciones."
      />

      <ServiciosKpis
        totalAdheridos={p.totalAdheridos}
        totalPagarMes={p.totalPagarMes}
        cantFacturas={p.prox.length}
        totalVencidos={p.totalVencidos}
        cantDisponibles={p.disponibles.length}
      />

      <SeccionesServicios
        sectionTab={p.sectionTab}
        onChange={p.setSectionTab}
        counts={{
          proximos: p.prox.length,
          suscritos: p.suscritos.length,
          disponibles: p.disponibles.length,
          historial: p.hFiltrados.length,
        }}
      />

      {p.sectionTab === "proximos" && (
        <ProximosPagos
          prox={p.prox}
          all={p.verTodos.proximos}
          onToggleAll={() => p.toggleVerTodos("proximos")}
          onPagar={p.setPagar}
        />
      )}

      {p.sectionTab === "suscritos" && (
        <ServiciosSuscritos
          suscritos={p.suscritos}
          busqueda={p.busqueda}
          onBusqueda={p.setBusqueda}
          sort={p.sort}
          onSort={p.setSort}
          catFilt={p.catFilt}
          onCatFilt={p.setCatFilt}
          all={p.verTodos.suscritos}
          onToggleAll={() => p.toggleVerTodos("suscritos")}
          onEditar={p.setEditarServicio}
          onPagar={p.setPagar}
        />
      )}

      {p.sectionTab === "disponibles" && (
        <ServiciosDisponibles
          alta={p.alta}
          disponibles={p.disponibles}
          all={p.verTodos.disponibles}
          onToggleAll={() => p.toggleVerTodos("disponibles")}
          onEscanear={() => p.setScanOpen(true)}
        />
      )}

      {p.sectionTab === "historial" && (
        <HistorialServicios
          filas={p.hFiltrados}
          filtros={p.historialFiltros}
          all={p.verTodos.historial}
          onToggleAll={() => p.toggleVerTodos("historial")}
        />
      )}

      <EditarServicioDialog servicio={p.editarServicio} onClose={() => p.setEditarServicio(null)} />
      <PagarServicioDialog pagar={p.pagar} onClose={() => p.setPagar(null)} />

      <BarcodeScanModal
        open={p.scanOpen}
        onClose={() => p.setScanOpen(false)}
        onDetect={(code) => p.alta.setNumeroNuevo(code)}
      />
    </>
  );
}
