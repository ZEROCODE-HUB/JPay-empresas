import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PageHeader, BtnOutline } from "@/components/portal-shell";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { TransferProcessingOverlay } from "@/components/transfer-ui";
import { usePantallaTransferencias } from "@/features/transferencias/hooks/usePantallaTransferencias";
import { useEnvioTransferencia } from "@/features/transferencias/hooks/useEnvioTransferencia";
import {
  PanelTabs,
  ResumenTransferencias,
} from "@/features/transferencias/components/ResumenTransferencias";
import { TransferenciaUnica } from "@/features/transferencias/components/TransferenciaUnica";
import { Programar } from "@/features/transferencias/components/Programar";
import { Borradores } from "@/features/transferencias/components/Borradores";
import { Programadas } from "@/features/transferencias/components/Programadas";
import { DestinatariosFrecuentes } from "@/features/transferencias/components/DestinatariosFrecuentes";
import { PlantillasDialog } from "@/features/transferencias/components/PlantillasDialog";
import { OtpDialog } from "@/features/transferencias/components/OtpDialog";
import { ReciboTransferencia } from "@/features/transferencias/components/ReciboTransferencia";

export const Route = createFileRoute("/app/transferencias")({ component: Page });

function Page() {
  const p = usePantallaTransferencias();
  const { contexto, listas, prefill, plantillas, programadas } = p;
  const envio = useEnvioTransferencia(contexto);
  const eliminarBorrador = p.eliminacion.pendiente?.tipo === "borrador";

  return (
    <>
      <PageHeader
        title="Transferir"
        description="Envios inmediatos, programados y a CBU, CVU o alias."
        action={
          <BtnOutline onClick={plantillas.abrir}>
            <FileText size={14} /> Plantillas
          </BtnOutline>
        }
      />

      {listas.listasError && (
        <div className="mb-4 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No se pudieron cargar tus listas guardadas: {listas.listasError}
        </div>
      )}

      <ResumenTransferencias
        totalDisponible={contexto.totalDisponible}
        subcuentas={contexto.subcuentas.length}
        enviadoMes={contexto.enviadoMes}
        programadas={listas.scheduled.length}
      />

      <PanelTabs tab={p.tab} onTab={p.cambiarTab}>
        {p.tab === "unica" && (
          <TransferenciaUnica
            confirm={envio.confirm}
            setConfirm={envio.setConfirm}
            onOtpRequired={envio.solicitarTransferencia}
            subcuentas={contexto.subcuentas}
            onTransferPayload={envio.setTransferPayload}
            frecuentes={listas.frecuentes}
            onSaveDraft={p.borradores.guardar}
            prefilledDestinatario={prefill.destinatario}
            onClearPrefill={prefill.limpiarDestinatario}
            template={prefill.template}
            onClearTemplate={prefill.limpiarTemplate}
          />
        )}
        {p.tab === "programar" && (
          <Programar
            subcuentas={contexto.subcuentas}
            frecuentes={listas.frecuentes}
            programada={programadas.editando}
            onCancelarEdicion={programadas.cancelarEdicion}
            template={prefill.template}
            onClearTemplate={prefill.limpiarTemplate}
            onSuccess={programadas.guardada}
          />
        )}
        {p.tab === "borradores" && (
          <Borradores
            drafts={listas.drafts}
            onDelete={p.borradores.eliminar}
            onEdit={p.borradores.editar}
            onExecute={p.borradores.ejecutar}
          />
        )}
        {p.tab === "programadas" && (
          <Programadas
            items={listas.scheduled}
            onCancel={programadas.cancelar}
            onEdit={programadas.editar}
            onExecute={programadas.ejecutar}
          />
        )}
        {p.tab === "destinatarios" && (
          <DestinatariosFrecuentes
            items={listas.frecuentes}
            onSelect={p.frecuentes.usar}
            onDelete={p.frecuentes.borrar}
          />
        )}
      </PanelTabs>

      <PlantillasDialog
        open={plantillas.open}
        onClose={plantillas.cerrar}
        templates={listas.templates}
        error={listas.templatesError}
        subcuentas={contexto.subcuentas}
        onAplicar={plantillas.aplicar}
        onBorrar={plantillas.borrar}
        onCrear={plantillas.crear}
        onEditar={plantillas.editar}
      />

      <OtpDialog {...envio.otp} />

      {envio.procesando && (
        <TransferProcessingOverlay paso={envio.procesando.paso} monto={envio.procesando.monto} />
      )}

      <ReciboTransferencia
        {...envio.recibo}
        clienteNombre={contexto.clienteNombre}
        clienteCuit={contexto.clienteCuit}
        frecuentes={listas.frecuentes}
        onGuardarFrecuente={p.frecuentes.guardar}
      />

      <ConfirmDialog
        variant="danger"
        closeOnConfirm
        open={p.eliminacion.pendiente !== null}
        title={eliminarBorrador ? "¿Eliminar borrador?" : "¿Cancelar transferencia programada?"}
        message="Esta accion no se puede deshacer."
        confirmLabel={eliminarBorrador ? "Eliminar" : "Cancelar"}
        onClose={p.eliminacion.cerrar}
        onConfirm={p.eliminacion.confirmar}
      />
    </>
  );
}
