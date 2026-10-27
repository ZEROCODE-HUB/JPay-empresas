import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { BtnPrimary, PageHeader } from "@/components/portal-shell";
import { usePuntosVenta } from "@/hooks/useQr";
import { DetallePdvDialog } from "@/features/qr/puntos-de-venta/components/DetallePdvDialog";
import { EliminarPdvDialog } from "@/features/qr/puntos-de-venta/components/EliminarPdvDialog";
import {
  EscaneoCard,
  EscanearDialog,
} from "@/features/qr/puntos-de-venta/components/EscaneoCodigos";
import { FiltrosPdv } from "@/features/qr/puntos-de-venta/components/FiltrosPdv";
import { InfoPuntosVenta } from "@/features/qr/puntos-de-venta/components/InfoPuntosVenta";
import { PaginacionPdv } from "@/features/qr/puntos-de-venta/components/PaginacionPdv";
import { PdvFormDialog } from "@/features/qr/puntos-de-venta/components/PdvFormDialog";
import { TablaPdv } from "@/features/qr/puntos-de-venta/components/TablaPdv";
import { useAccionesPdv } from "@/features/qr/puntos-de-venta/hooks/useAccionesPdv";
import { useFiltrosPdv } from "@/features/qr/puntos-de-venta/hooks/useFiltrosPdv";
import { resumenTotal } from "@/features/qr/puntos-de-venta/utils";

export const Route = createFileRoute("/app/qr/puntos-de-venta")({ component: Page });

function Page() {
  const pdvsQuery = usePuntosVenta();
  const pdvs = useMemo(() => pdvsQuery.data?.pdvs ?? [], [pdvsQuery.data]);
  const comercioId = pdvsQuery.data?.comercioId ?? null;
  const loading = pdvsQuery.isFetching;
  const f = useFiltrosPdv(pdvs);
  const a = useAccionesPdv(comercioId);
  const [scan, setScan] = useState(false);

  return (
    <>
      <PageHeader
        title="Puntos de Venta"
        description="Crea y gestiona los puntos de venta con cobro mediante QR."
      />

      <EscaneoCard onEscanear={() => setScan(true)} />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-muted-foreground">
            {loading ? "Cargando…" : resumenTotal(f.filtered.length, pdvs.length)}
          </p>
        </div>
        <BtnPrimary onClick={a.openCrear}>
          <Plus size={15} /> Crear Punto de Venta
        </BtnPrimary>
      </div>

      <InfoPuntosVenta />
      <FiltrosPdv f={f} />

      <TablaPdv
        loading={loading}
        filas={f.paginated}
        onVer={a.verDetalle}
        onEditar={a.openEditar}
        onEliminar={a.confirmarEliminar}
      />

      {!loading && f.paginated.length > 0 && <PaginacionPdv f={f} />}

      <PdvFormDialog
        open={a.crearOpen}
        editing={!!a.editingId}
        form={a.form}
        setForm={a.setForm}
        onClose={() => a.setCrearOpen(false)}
        onSubmit={a.guardar}
      />

      {a.detalleOpen && a.detallePd && (
        <DetallePdvDialog
          pdv={a.detallePd}
          qrDataUrl={a.qrDataUrl}
          onClose={() => a.setDetalleOpen(false)}
          onEditar={() => {
            a.setDetalleOpen(false);
            if (a.detallePd) a.openEditar(a.detallePd);
          }}
        />
      )}

      <EscanearDialog open={scan} onClose={() => setScan(false)} />

      <EliminarPdvDialog
        open={a.eliminarOpen}
        onClose={() => a.setEliminarOpen(false)}
        onConfirm={a.ejecutarEliminar}
      />
    </>
  );
}
