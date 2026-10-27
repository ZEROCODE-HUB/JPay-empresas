import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { BtnOutline, BtnPrimary, PageHeader } from "@/components/portal-shell";
import { DetalleMovimientoDialog } from "@/features/historial/components/DetalleMovimientoDialog";
import { FiltrosCard } from "@/features/historial/components/FiltrosCard";
import { HistorialKpis } from "@/features/historial/components/HistorialKpis";
import { MovimientosTabla } from "@/features/historial/components/MovimientosTabla";
import { VistaSelector } from "@/features/historial/components/VistaSelector";
import { exportarHistorialExcel, exportarHistorialPdf } from "@/features/historial/export";
import { useComprobanteMovimiento } from "@/features/historial/hooks/useComprobanteMovimiento";
import { PAGE_SIZE, useFiltrosHistorial } from "@/features/historial/hooks/useFiltrosHistorial";
import { useGruposTxid } from "@/features/historial/hooks/useGruposTxid";
import { aLinea, totalesPagina } from "@/features/historial/utils";
import { useExportacionHistorial } from "@/hooks/useMovimientos";
import { MAX_FILAS_EXPORTACION } from "@/lib/api/movimientos";
import {
  useMovimientosHistorial,
  useVistaHistorial,
} from "@/features/historial/hooks/useMovimientosHistorial";

// `?subcuenta=<nombre>` llega desde Subcuentas ("Ver historial") y preselecciona el filtro.
export const Route = createFileRoute("/app/historial")({
  validateSearch: (search: Record<string, unknown>): { subcuenta?: string } => ({
    subcuenta:
      typeof search.subcuenta === "string" && search.subcuenta ? search.subcuenta : undefined,
  }),
  component: Page,
});

function Page() {
  const { subcuenta: subcuentaInicial } = Route.useSearch();
  const filtros = useFiltrosHistorial(subcuentaInicial);
  const mov = useMovimientosHistorial(filtros.query);
  const vista = useVistaHistorial(
    filtros.subFiltro,
    filtros.setSubFiltro,
    mov.subcuentas[0]?.nombre,
  );
  const grupos = useGruposTxid(mov.lineas);
  const comprobante = useComprobanteMovimiento(mov.cliente);
  const exportacion = useExportacionHistorial();

  // Se exportan todos los movimientos filtrados, no solo la página visible.
  const lineasAExportar = async () => {
    const { page: _page, pageSize: _pageSize, ...filtrosSinPagina } = filtros.query;
    try {
      const res = await exportacion.mutateAsync(filtrosSinPagina);
      if (res.truncado)
        toast.warning(`Se exportan los primeros ${MAX_FILAS_EXPORTACION} movimientos`);
      return res.lineas.map(aLinea);
    } catch {
      toast.error("No se pudieron obtener los movimientos para exportar");
      return null;
    }
  };
  const exportExcel = async () => {
    const lineas = await lineasAExportar();
    if (!lineas) return;
    exportarHistorialExcel(lineas, totalesPagina(lineas));
    toast.success("Excel descargado");
  };
  const exportPDF = async () => {
    const lineas = await lineasAExportar();
    if (!lineas) return;
    const serie = "RP-EMP-2026-" + Math.floor(100000 + Math.random() * 899999);
    exportarHistorialPdf(lineas, totalesPagina(lineas), serie);
    toast.success("PDF descargado");
  };

  return (
    <>
      <PageHeader
        title="Historial"
        description="Auditoria completa de movimientos con filtros, exportacion y detalle de transacciones."
        action={
          <div className="flex gap-2">
            <BtnOutline onClick={() => void exportExcel()} disabled={exportacion.isPending}>
              <FileSpreadsheet size={14} /> Excel
            </BtnOutline>
            <BtnPrimary onClick={() => void exportPDF()} disabled={exportacion.isPending}>
              <Download size={14} /> PDF
            </BtnPrimary>
          </div>
        }
      />

      <VistaSelector vista={vista} subcuentas={mov.subcuentas} sinSubcuentas={mov.sinSubcuentas} />

      <HistorialKpis totales={mov.totales} />

      <FiltrosCard
        f={filtros}
        subcuentas={mov.subcuentas}
        sinSubcuentas={mov.sinSubcuentas}
        loading={mov.loading}
        totalCount={mov.totalCount}
        agrupar={grupos.agrupar}
        onAgrupar={grupos.setAgrupar}
        onExcel={() => void exportExcel()}
        onPdf={() => void exportPDF()}
      />

      <MovimientosTabla
        loading={mov.loading}
        grupos={grupos}
        page={filtros.page}
        pageSize={PAGE_SIZE}
        totalCount={mov.totalCount}
        totalPages={mov.totalPages}
        onPage={filtros.setPage}
        onBuscarTxid={filtros.setBuscarTxid}
        onVerDetalle={(l) => void comprobante.verDetalle(l)}
        onDescargar={(l) => void comprobante.descargar(l)}
        onCompartir={(l) => void comprobante.compartir(l)}
      />

      {comprobante.detalle && (
        <DetalleMovimientoDialog
          detalle={comprobante.detalle}
          onClose={comprobante.cerrarDetalle}
          onDescargar={comprobante.descargarMov}
          onCompartir={(m) => void comprobante.compartirMov(m)}
        />
      )}
    </>
  );
}
