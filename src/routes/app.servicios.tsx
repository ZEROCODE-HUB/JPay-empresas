import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { BarcodeScanModal } from "@/features/servicios/components/BarcodeScanModal";
import { HistorialServicios } from "@/features/servicios/components/HistorialServicios";
import { ProximosPagos } from "@/features/servicios/components/ProximosPagos";
import { RemesasTab } from "@/features/servicios/components/RemesasTab";
import {
  EditarServicioDialog,
  PagarServicioDialog,
  RemesaDialog,
} from "@/features/servicios/components/ServiciosDialogs";
import { ServiciosDisponibles } from "@/features/servicios/components/ServiciosDisponibles";
import { ServiciosKpis } from "@/features/servicios/components/ServiciosKpis";
import { ServiciosSuscritos } from "@/features/servicios/components/ServiciosSuscritos";
import { SeccionesServicios, ServiciosTabs } from "@/features/servicios/components/ServiciosTabs";
import { usePantallaServicios } from "@/features/servicios/hooks/usePantallaServicios";

export const Route = createFileRoute("/app/servicios")({ component: Page });

function Page() {
  const p = usePantallaServicios();

  return (
    <>
      <PageHeader
        title="Servicios y pagos"
        description="Pago de servicios, remesas internacionales e historial de operaciones."
      />

      <ServiciosKpis
        totalAdheridos={p.totalAdheridos}
        totalPagarMes={p.totalPagarMes}
        cantFacturas={p.prox.length}
        totalVencidos={p.totalVencidos}
        cantDisponibles={p.disponibles.length}
      />

      <ServiciosTabs tab={p.tab} onChange={p.setTab} />

      {p.tab === "servicios" && (
        <>
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
        </>
      )}

      {p.tab === "remesas" && <RemesasTab onNueva={() => p.setRemesaOpen(true)} />}

      <EditarServicioDialog servicio={p.editarServicio} onClose={() => p.setEditarServicio(null)} />
      <PagarServicioDialog pagar={p.pagar} onClose={() => p.setPagar(null)} />
      <RemesaDialog open={p.remesaOpen} onClose={() => p.setRemesaOpen(false)} />

      <BarcodeScanModal
        open={p.scanOpen}
        onClose={() => p.setScanOpen(false)}
        onDetect={(code) => p.alta.setNumeroNuevo(code)}
      />
    </>
  );
}
