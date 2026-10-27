import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageHeader, BtnPrimary, Stat } from "@/components/portal-shell";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { formatMoney } from "@/shared/format";
import { DestinatariosTabla } from "@/features/destinatarios/components/DestinatariosTabla";
import { NuevoDestinatarioDialog } from "@/features/destinatarios/components/NuevoDestinatarioDialog";
import { TransferirDialog } from "@/features/destinatarios/components/TransferirDialog";
import { useAgendaDestinatarios } from "@/features/destinatarios/hooks/useAgendaDestinatarios";
import { useNuevoDestinatario } from "@/features/destinatarios/hooks/useNuevoDestinatario";
import { useTransferirDestinatario } from "@/features/destinatarios/hooks/useTransferirDestinatario";

export const Route = createFileRoute("/app/destinatarios")({ component: Page });

function Page() {
  const agenda = useAgendaDestinatarios();
  const nuevo = useNuevoDestinatario(agenda.cargarDestinatarios);
  const t = useTransferirDestinatario();
  const { items, eliminar, setEliminar } = agenda;
  const { subcuentas } = t;

  return (
    <>
      <PageHeader
        title="Mis destinatarios"
        description="Agenda de contactos frecuentes con validacion CBU."
        action={
          <div className="flex gap-2">
            <BtnPrimary onClick={() => nuevo.setOpen(true)}>
              <Plus size={16} /> Nuevo destinatario
            </BtnPrimary>
          </div>
        }
      />

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Stat label="Total destinatarios" value={String(items.length)} />
        <Stat label="Subcuentas" value={String(subcuentas.length)} />
        <Stat
          label="Disponible"
          value={formatMoney(subcuentas.reduce((s, x) => s + (Number(x.saldo_disponible) || 0), 0))}
        />
      </div>

      <DestinatariosTabla agenda={agenda} onTransferir={t.abrir} />

      <NuevoDestinatarioDialog f={nuevo} />

      <TransferirDialog t={t} />

      <ConfirmDialog
        confirmLabel="Eliminar"
        variant="danger"
        closeOnConfirm
        open={!!eliminar}
        title="Eliminar destinatario"
        message={
          eliminar
            ? `Se quitará "${eliminar.n}" de tu agenda. No afecta transferencias ya hechas.`
            : ""
        }
        onClose={() => setEliminar(null)}
        onConfirm={agenda.confirmarEliminar}
      />
    </>
  );
}
