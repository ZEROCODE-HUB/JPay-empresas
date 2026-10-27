import { useState } from "react";
import { toast } from "sonner";
import { toDataError } from "@/lib/supabase";
import type { RecipientTitular } from "@/lib/recipient-validation";
import { executeTransfer } from "@/lib/transfer-orchestrator";
import { useContextoTransferencias, useListasTransferencias } from "@/hooks/useTransferencias";
import { formatMoney } from "@/shared/format";
import {
  type Draft,
  type Scheduled,
  type Template,
  createDraft,
  deleteDraft,
  cancelScheduledTransfer,
  markScheduledExecuted,
  listFrequentRecipients,
  createFrequentRecipient,
  deleteFrequentRecipient,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/lib/api/transferencias";
import type { CoelsaResult, PlantillaInput, Tab } from "../types";
import { upsertPlantilla, upsertProgramada } from "../utils";

/**
 * Estado de la pantalla Transferir: pestaña activa, precargas entre pestañas y
 * las acciones sobre borradores, programadas, frecuentes y plantillas.
 */
export function usePantallaTransferencias() {
  const [tab, setTab] = useState<Tab>("unica");
  const [prefilledDestinatario, setPrefilledDestinatario] = useState<CoelsaResult | undefined>(
    undefined,
  );
  const [templatesOpen, setTemplatesOpen] = useState(false);
  /** Scheduled que se esta editando en la pestana "Programar" (null = nueva). */
  const [editingScheduled, setEditingScheduled] = useState<Scheduled | null>(null);
  /** Template picked: it prefills the form and is cleared afterwards. */
  const [templatePrefill, setTemplatePrefill] = useState<Template | null>(null);
  const [confirmarEliminacion, setConfirmarEliminacion] = useState<{
    tipo: "borrador" | "programada";
    id: string;
  } | null>(null);

  const contexto = useContextoTransferencias();
  const cargarDatos = contexto.recargar;

  /**
   * Drafts, scheduled transfers, frequent recipients and templates (table
   * `plantillas_transferencia`, migration 1016) live in Supabase.
   */
  const listas = useListasTransferencias();
  const { drafts, scheduled, setDrafts, setScheduled, setFrecuentes, setTemplates } = listas;

  const cambiarTab = (key: Tab) => {
    // Al salir de "Programar" se cancela cualquier edicion abierta.
    if (key !== "programar") setEditingScheduled(null);
    // Refresh when entering the scheduled tab: the worker may have run something.
    if (key === "programadas") void listas.refreshScheduledTransfers();
    setTab(key);
  };

  /* ----- Plantillas ----- */

  /** Closes the dialog, switches tab and prefills the form. */
  const applyTemplate = (p: Template) => {
    setTemplatesOpen(false);
    setTab(p.tipo);
    setTemplatePrefill(p);
    toast.success(
      p.destinatario
        ? `Template "${p.nombre}" cargada`
        : `Template "${p.nombre}" cargada${p.monto != null ? ` — ${formatMoney(p.monto)}` : ""}. Elegi el CBU/CVU/alias del destinatario.`,
    );
  };

  const handleDeleteTemplate = async (p: Template) => {
    try {
      await deleteTemplate(p.id);
      setTemplates((prev) => prev.filter((x) => x.id !== p.id));
      toast.success(`Template "${p.nombre}" eliminada`);
    } catch (e) {
      toast.error(toDataError(e).message);
    }
  };

  /** Creates a generic template (no recipient) from the templates modal. */
  const createTemplateQuick = async (input: PlantillaInput): Promise<boolean> => {
    try {
      const fila = await createTemplate({
        nombre: input.nombre,
        tipo: "unica",
        monto: input.monto,
        subcuentaOrigen: input.subcuentaOrigen,
        concepto: input.concepto,
      });
      setTemplates((prev) => upsertPlantilla(prev, fila));
      toast.success(`Template "${fila.nombre}" guardada`);
      return true;
    } catch (e) {
      toast.error(toDataError(e).message);
      return false;
    }
  };

  /** Updates a template from the modal (name, amount, origin and concept). */
  const editTemplate = async (id: string, input: PlantillaInput): Promise<boolean> => {
    try {
      const fila = await updateTemplate(id, input);
      setTemplates((prev) => upsertPlantilla(prev, fila));
      toast.success(`Template "${fila.nombre}" actualizada`);
      return true;
    } catch (e) {
      toast.error(toDataError(e).message);
      return false;
    }
  };

  /* ----- Borradores ----- */

  const guardarBorrador = async (d: Draft) => {
    try {
      const fila = await createDraft({
        destinatario: {
          nombre: d.destinatario,
          alias: d.alias,
          cbu: d.cbu ?? "",
          cuit: d.cuit,
          banco: d.banco,
        },
        subcuentaOrigen: d.subcuentaOrigen,
        monto: d.montoNum ?? 0,
        concepto: d.concepto,
      });
      setDrafts((prev) => [fila, ...prev.filter((x) => x.id !== fila.id)]);
      toast.success("Borrador guardado");
    } catch (e) {
      toast.error(toDataError(e).message);
    }
  };

  const editarBorrador = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (d?.cbu)
      setPrefilledDestinatario({
        nombre: d.destinatario,
        cuit: d.cuit ?? "",
        cbu: d.cbu,
        alias: d.alias,
      });
    setTab("unica");
    toast.success("Borrador cargado en el formulario");
  };

  const ejecutarBorrador = async (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d?.cbu || !d.montoNum || !d.subcuentaOrigen) {
      toast.error("Borrador incompleto");
      return;
    }
    try {
      const res = await executeTransfer({
        subcuentaOrigenId: d.subcuentaOrigen!,
        destinatarioIdentifier: d.cbu!,
        monto: d.montoNum!,
        concepto: d.concepto,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Validación fallida");
        return;
      }
      // Executed: the draft no longer exists (the movement stays in `movimientos`).
      await deleteDraft(id);
      setDrafts((prev) => prev.filter((x) => x.id !== id));
      toast.success(`Draft ejecutado — TXID: ${res.txn.id_txn}`);
      await cargarDatos();
    } catch (e) {
      toast.error(toDataError(e).message);
    }
  };

  /* ----- Programadas ----- */

  const programadaGuardada = (s: Scheduled) => {
    const editando = editingScheduled?.id === s.id;
    setScheduled((prev) => upsertProgramada(prev, s));
    setEditingScheduled(null);
    toast.success(editando ? "Transferencia programada actualizada" : "Transferencia programada");
    setTab("programadas");
  };

  const cancelarEdicionProgramada = () => {
    setEditingScheduled(null);
    setTab("programadas");
  };

  const cancelarProgramada = (id: string) => {
    const s = scheduled.find((x) => x.id === id);
    if (!s) {
      toast.error("No se encontro la programada");
      return;
    }
    if (s.estado !== "Programada") {
      toast.error(`Esta transferencia ya esta ${s.estado.toLowerCase()}`);
      return;
    }
    setConfirmarEliminacion({ tipo: "programada", id });
  };

  const editarProgramada = (id: string) => {
    const s = scheduled.find((x) => x.id === id);
    if (!s) {
      toast.error("No se encontro la programada");
      return;
    }
    if (s.estado !== "Programada") {
      toast.error(`No se puede editar una transferencia ${s.estado.toLowerCase()}`);
      return;
    }
    // Same as drafts and frequent recipients: it loads into the "Programar"
    // form and is saved from there.
    setEditingScheduled(s);
    setTab("programar");
    toast.success("Programada cargada en el formulario");
  };

  const ejecutarProgramada = async (id: string) => {
    const s = scheduled.find((x) => x.id === id);
    if (!s) {
      toast.error("No se encontro la programada");
      return;
    }
    // A scheduled transfer that already ran (or was cancelled) never runs again.
    if (s.estado !== "Programada") {
      toast.error(
        `Esta transferencia ya esta ${s.estado.toLowerCase()} y no se puede volver a ejecutar`,
      );
      return;
    }
    if (!s.cbu || !s.montoNum || !s.subcuentaOrigen) {
      toast.error("Programada incompleta");
      return;
    }
    try {
      const res = await executeTransfer({
        subcuentaOrigenId: s.subcuentaOrigen!,
        destinatarioIdentifier: s.cbu!,
        monto: s.montoNum!,
        concepto: s.concepto,
        kind: "programada",
      });
      if (!res.ok) {
        toast.error(res.error ?? "Validación fallida");
        return;
      }
      await markScheduledExecuted(id);
      setScheduled((prev) => prev.map((x) => (x.id === id ? { ...x, estado: "Ejecutada" } : x)));
      toast.success(`Scheduled ejecutada — TXID: ${res.txn.id_txn}`);
      await cargarDatos();
    } catch (e) {
      toast.error(toDataError(e).message);
    }
  };

  /** Borra el borrador o cancela la programada pendiente de confirmación. */
  const confirmarEliminacionPendiente = async () => {
    const pendiente = confirmarEliminacion;
    setConfirmarEliminacion(null);
    if (!pendiente) return;
    try {
      if (pendiente.tipo === "borrador") {
        await deleteDraft(pendiente.id);
        setDrafts((prev) => prev.filter((d) => d.id !== pendiente.id));
        toast.success("Borrador eliminado");
      } else {
        // No se borra: queda `cancelada` en la tabla para auditoria.
        await cancelScheduledTransfer(pendiente.id);
        setScheduled((prev) =>
          prev.map((s) => (s.id === pendiente.id ? { ...s, estado: "Cancelada" } : s)),
        );
        toast.success("Transferencia cancelada");
      }
    } catch (e) {
      toast.error(toDataError(e).message);
    }
  };

  /* ----- Destinatarios frecuentes ----- */

  const usarFrecuente = (d: CoelsaResult) => {
    setPrefilledDestinatario(d);
    setTab("unica");
    toast.success("Destinatario cargado");
  };

  const borrarFrecuente = async (id: string) => {
    try {
      await deleteFrequentRecipient(id);
      setFrecuentes((prev) => prev.filter((x) => x.id !== id));
      toast.success("Destinatario eliminado");
    } catch (e) {
      toast.error(toDataError(e).message);
    }
  };

  /** "Guardar destinatario" desde el comprobante. */
  const guardarFrecuente = async (identifier: string, titular: RecipientTitular) => {
    try {
      await createFrequentRecipient({
        identifier,
        nombre: titular.nombre,
        alias: titular.alias,
        cbu: titular.cbu,
        cuit: titular.cuit,
        banco: titular.banco,
      });
      setFrecuentes(await listFrequentRecipients());
      toast.success("Destinatario agregado a frecuentes");
    } catch (e) {
      toast.error(toDataError(e).message);
      throw e;
    }
  };

  return {
    tab,
    cambiarTab,
    contexto,
    listas,
    prefill: {
      destinatario: prefilledDestinatario,
      limpiarDestinatario: () => setPrefilledDestinatario(undefined),
      template: templatePrefill,
      limpiarTemplate: () => setTemplatePrefill(null),
    },
    plantillas: {
      open: templatesOpen,
      abrir: () => setTemplatesOpen(true),
      cerrar: () => setTemplatesOpen(false),
      aplicar: applyTemplate,
      borrar: handleDeleteTemplate,
      crear: createTemplateQuick,
      editar: editTemplate,
    },
    borradores: {
      guardar: guardarBorrador,
      editar: editarBorrador,
      ejecutar: ejecutarBorrador,
      eliminar: (id: string) => setConfirmarEliminacion({ tipo: "borrador", id }),
    },
    programadas: {
      editando: editingScheduled,
      guardada: programadaGuardada,
      cancelarEdicion: cancelarEdicionProgramada,
      cancelar: cancelarProgramada,
      editar: editarProgramada,
      ejecutar: ejecutarProgramada,
    },
    frecuentes: { usar: usarFrecuente, borrar: borrarFrecuente, guardar: guardarFrecuente },
    eliminacion: {
      pendiente: confirmarEliminacion,
      cerrar: () => setConfirmarEliminacion(null),
      confirmar: confirmarEliminacionPendiente,
    },
  };
}
