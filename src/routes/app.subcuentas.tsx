import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Plus } from "lucide-react";
import { BtnOutline, BtnPrimary, PageHeader } from "@/components/portal-shell";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useSubcuentasCliente } from "@/hooks/useSubcuentas";
import { SubDetailModal } from "@/features/subcuentas/components/SubDetailModal";
import { SubcuentaFormDialog } from "@/features/subcuentas/components/SubcuentaFormDialog";
import { SubcuentasFiltros } from "@/features/subcuentas/components/SubcuentasFiltros";
import { SubcuentasKpis } from "@/features/subcuentas/components/SubcuentasKpis";
import { SubcuentasTabla } from "@/features/subcuentas/components/SubcuentasTabla";
import { TransferirSubcuentasDialog } from "@/features/subcuentas/components/TransferirSubcuentasDialog";
import { useAccionesSubcuenta } from "@/features/subcuentas/hooks/useAccionesSubcuenta";
import { useFormSubcuenta } from "@/features/subcuentas/hooks/useFormSubcuenta";
import { useListadoSubcuentas } from "@/features/subcuentas/hooks/useListadoSubcuentas";
import { useTransferenciaInterna } from "@/features/subcuentas/hooks/useTransferenciaInterna";
import type { Sub } from "@/features/subcuentas/types";
import { mapSubs } from "@/features/subcuentas/utils";

export const Route = createFileRoute("/app/subcuentas")({ component: Page });

function Page() {
  const navigate = useNavigate();
  const { subs, setSubs, clienteLegajo, loading, recargar } = useSubcuentasCliente(mapSubs);
  const listado = useListadoSubcuentas(subs);
  const form = useFormSubcuenta(clienteLegajo, recargar);
  const transf = useTransferenciaInterna(subs, recargar);
  const acciones = useAccionesSubcuenta(setSubs);

  const abrirFondeo = (s: Sub) => {
    transf.abrirFondeo(s);
    acciones.setDetailSub(null);
  };
  const verHistorial = (s: Sub) => {
    navigate({ to: "/app/historial", search: { subcuenta: s.n } });
  };
  const detailSub = acciones.detailSub;
  const confirmarBorrar = acciones.confirmarBorrar;

  return (
    <>
      <PageHeader
        title="Subcuentas"
        description="Una cuenta madre, múltiples CVU. Gestiona fondos, responsables y límites."
        action={
          <div className="flex gap-2">
            <BtnOutline onClick={() => transf.setOpen(true)}>
              <ArrowLeftRight size={14} /> Transferir entre subcuentas
            </BtnOutline>
            <BtnPrimary onClick={form.abrirNuevo}>
              <Plus size={16} /> Nueva subcuenta
            </BtnPrimary>
          </div>
        }
      />

      <SubcuentasKpis subs={subs} />

      <SubcuentasFiltros
        q={listado.q}
        onQ={listado.setQ}
        tipo={listado.tipo}
        onTipo={listado.setTipo}
        estado={listado.estado}
        onEstado={listado.setEstado}
      />

      <SubcuentasTabla
        loading={loading}
        paginated={listado.paginated}
        totalFiltradas={listado.filtradas.length}
        page={listado.page}
        pageSize={listado.pageSize}
        totalPages={listado.totalPages}
        setPage={listado.setPage}
        menuId={acciones.menuId}
        setMenuId={acciones.setMenuId}
        onVerDetalle={acciones.setDetailSub}
        onFondear={abrirFondeo}
        onVerHistorial={verHistorial}
        onEditar={form.abrirEditar}
        onCambiarEstado={acciones.cambiarEstado}
        onBorrar={acciones.setConfirmarBorrar}
      />

      {detailSub && (
        <SubDetailModal
          sub={detailSub}
          onClose={() => acciones.setDetailSub(null)}
          onCambiarEstado={acciones.cambiarEstado}
          onFondear={() => abrirFondeo(detailSub)}
          onVerHistorial={() => verHistorial(detailSub)}
        />
      )}

      <SubcuentaFormDialog
        open={form.open}
        editSub={form.editSub}
        form={form.form}
        setForm={form.setForm}
        onClose={form.cerrar}
        onSubmit={form.guardar}
      />

      <TransferirSubcuentasDialog subs={subs} t={transf} />

      <ConfirmDialog
        confirmLabel="Eliminar"
        variant="danger"
        closeOnConfirm
        open={confirmarBorrar !== null}
        title="¿Eliminar subcuenta?"
        message={`Se quitara la subcuenta ${confirmarBorrar?.n} (CVU ${confirmarBorrar?.cbu || "sin asignar"}). Esta accion no se puede deshacer.`}
        onClose={() => acciones.setConfirmarBorrar(null)}
        onConfirm={acciones.borrar}
      />
    </>
  );
}
