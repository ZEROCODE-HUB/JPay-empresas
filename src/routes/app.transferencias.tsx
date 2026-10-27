import { createFileRoute } from "@tanstack/react-router";
import { brand } from "@/brand/brand";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUpRight,
  Calendar,
  Clock,
  ShieldCheck,
  Star,
  Trash2,
  Edit3,
  Play,
  FileText,
  Save,
  Users,
  X,
  KeyRound,
} from "lucide-react";
import { PageHeader, Input, Label, BtnPrimary, BtnOutline, Badge } from "@/components/portal-shell";
import { toast } from "sonner";
import { FormDialog } from "@/components/form-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  requireSupabase,
  toDataError,
  isPermissionError,
  extraerMensajeEdgeFunction,
} from "@/lib/supabase";
import { detectIdentifierKind, type RecipientTitular } from "@/lib/recipient-validation";
import { validateRecipient } from "@/lib/recipient-bdc";
import { descargarComprobantePdf } from "@/lib/comprobante-pdf";
import { compartirComprobante } from "@/lib/comprobante-imagen";
import { type DatosComprobante } from "@/lib/comprobante";
import { executeTransfer } from "@/lib/transfer-orchestrator";
import { createBdcClient, canTransferBdc, type BdcAccount } from "@/lib/bdc";
import { SALDOS_EMBED, conSaldos } from "@/lib/subaccounts";
import {
  ResumenCotizacion,
  TransferProcessingOverlay,
  TransferReceiptModal,
  useCotizacion,
  type PasoTransferencia,
} from "@/components/transfer-ui";
import {
  type Draft as Draft,
  type Scheduled as Scheduled,
  type FrequentRecipient,
  type Template,
  listDrafts,
  createDraft,
  deleteDraft,
  listScheduledTransfers,
  createScheduledTransfer,
  updateScheduledTransfer,
  cancelScheduledTransfer,
  markScheduledExecuted,
  listFrequentRecipients,
  createFrequentRecipient,
  deleteFrequentRecipient,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  reserveBdcTransfer,
  confirmBdcTransfer,
  cancelBdcTransfer,
} from "@/lib/transfer-store";

export const Route = createFileRoute("/app/transferencias")({ component: Page });

type Tab = "unica" | "programar" | "borradores" | "programadas" | "destinatarios";

// Drafts and scheduled transfers are persisted in Supabase (`transfer-store`):
// their types live there and are re-exported here with the names this screen uses.
type CoelsaResult = {
  nombre: string;
  cuit: string;
  cbu: string;
  alias: string;
  /** Detalle extra que devuelve el banco al validar; puede venir vacío. */
  banco?: string;
  bancoCodigo?: string;
  tipoCuenta?: string;
  moneda?: string;
  activa?: boolean;
  tipoPersona?: string;
  tipoDoc?: string;
};
type Destinatario = CoelsaResult & { banco: string };

/**
 * Datos del comprobante a partir del resultado del envío y del destinatario
 * validado. Devuelve null si todavía no hay una transferencia enviada.
 */
function comprobanteDe(
  t: TransferSuccess | null,
  titular: RecipientTitular | null | undefined,
  clienteNombre: string,
  clienteCuit: string,
): DatosComprobante | null {
  if (!t || t.monto == null) return null;
  return {
    fecha: t.fecha ?? new Date().toISOString(),
    monto: t.monto,
    concepto: t.concepto,
    comision: t.comision,
    impuesto: t.impuesto,
    estado: t.estado,
    txid: t.txid,
    desde: { nombre: clienteNombre, cuit: clienteCuit, cbu: t.origenCbu ?? "" },
    hacia: {
      nombre: titular?.nombre ?? "",
      cuit: titular?.cuit ?? "",
      cbu: titular?.cbu ?? t.destino ?? "",
      banco: titular?.banco,
      alias: titular?.alias,
      tipoCuenta: titular?.tipoCuenta,
    },
  };
}

/**
 * Ficha del destinatario validado contra el banco: muestra todo lo que devuelve
 * `/accounts/info` (titular, CUIT/CUIL, banco, tipo de cuenta, moneda, estado).
 * Los destinatarios guardados (agenda/plantillas) no traen el detalle extra, así
 * que solo se muestran los datos disponibles.
 */
function FilaDestinatario({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`truncate ${strong ? "font-semibold" : "font-medium"} ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function DestinatarioValidadoCard({ d }: { d: CoelsaResult }) {
  const kind = detectIdentifierKind(d.cbu);
  const tipo = kind === "ALIAS" ? "Alias" : d.cbu.startsWith("000") ? "CVU" : "CBU";
  const banco = [d.banco, d.bancoCodigo ? `(${d.bancoCodigo})` : ""].filter(Boolean).join(" ");

  return (
    <div className="mt-2 border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={14} className="text-green-600" />
        <span className="text-[11px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider">
          Validado — {tipo}
        </span>
        {d.activa !== undefined && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              d.activa
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            }`}
          >
            {d.activa ? "Cuenta activa" : "Cuenta inactiva"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <FilaDestinatario label="Nombre" value={d.nombre} strong />
        <FilaDestinatario label={d.tipoDoc || "CUIT"} value={d.cuit || "—"} />
        {banco && <FilaDestinatario label="Banco" value={banco} />}
        {d.tipoCuenta && <FilaDestinatario label="Tipo de cuenta" value={d.tipoCuenta} />}
        {d.moneda && <FilaDestinatario label="Moneda" value={d.moneda} />}
        {d.tipoPersona && <FilaDestinatario label="Persona" value={d.tipoPersona} />}
        <FilaDestinatario label="CBU/CVU" value={d.cbu} mono />
        <FilaDestinatario label="Alias" value={d.alias ? `@${d.alias}` : "—"} />
      </div>
    </div>
  );
}

type TransferPayload = {
  subcuentaOrigen: string;
  destinatarioCbu: string;
  destinatarioCuit: string;
  destinatarioNombre: string;
  destinatarioAlias: string;
  /** Destinatario completo (detalle que devolvió el banco) para el comprobante. */
  destinatario?: CoelsaResult;
  monto: number;
  concepto: string;
};

/**
 /**
  * 2FA (email OTP) to confirm a single transfer.
 */
const OTP_ENABLED: boolean = false;

type TransferSuccess = {
  txid: string;
  estado?: string;
  mensaje?: string;
  /** Comprobante de la operación (se completa al enviar). */
  monto?: number;
  concepto?: string;
  origenNombre?: string;
  origenCbu?: string;
  destino?: string;
  comision?: number;
  impuesto?: number;
  fecha?: string;
};

type Subcuenta = {
  id: string;
  nombre: string;
  cbu: string | null;
  saldo_disponible: number;
  tipo: string;
};

const fmt = (n: number) =>
  `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const digitsOnly = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/** Badge color per scheduled-transfer status (executed = green). */
const STATUS_TONE: Record<string, "neutral" | "success" | "warn" | "danger"> = {
  Scheduled: "warn",
  Ejecutada: "success",
  Cancelada: "neutral",
  Error: "danger",
};

function Page() {
  const [tab, setTab] = useState<Tab>("unica");
  const [confirm, setConfirm] = useState(false);
  const [destAlias, setDestAlias] = useState("");
  const [saveDestOpen, setSaveDestOpen] = useState(false);
  const [destValidation, setDestValidation] = useState<
    import("@/lib/recipient-validation").RecipientValidationResult | null
  >(null);
  const [transferSuccess, setTransferSuccess] = useState<TransferSuccess | null>(null);
  /** Paso en curso del envio: muestra el overlay que bloquea la pantalla. */
  const [procesando, setProcesando] = useState<{ paso: PasoTransferencia; monto: number } | null>(
    null,
  );
  const [prefilledDestinatario, setPrefilledDestinatario] = useState<CoelsaResult | undefined>(
    undefined,
  );
  const [templatesOpen, setTemplatesOpen] = useState(false);
  /** Scheduled que se esta editando en la pestana "Programar" (null = nueva). */
  const [editingScheduled, setEditingScheduled] = useState<Scheduled | null>(null);
  /** Real template list (table `plantillas_transferencia`, migration 1016). */
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  /** Template picked: it prefills the form and is cleared afterwards. */
  const [templatePrefill, setTemplatePrefill] = useState<Template | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [frecuentes, setFrecuentes] = useState<FrequentRecipient[]>([]);
  const [listasError, setListasError] = useState<string | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [confirmarEliminacion, setConfirmarEliminacion] = useState<{
    tipo: "borrador" | "programada";
    id: string;
  } | null>(null);

  const [subcuentas, setSubcuentas] = useState<Subcuenta[]>([]);
  const [clienteCuit, setClienteCuit] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [totalDisponible, setTotalDisponible] = useState(0);
  const [enviadoMes, setEnviadoMes] = useState({ monto: 0, ops: 0 });
  const [, setLoading] = useState(true);

  const cargarDatos = useCallback(async () => {
    try {
      const sb = requireSupabase();
      const {
        data: { user },
      } = await sb.auth.getUser();
      const { data: cli } = await sb
        .from("clientes")
        .select("legajo, nombre, cuit, cuit_cuil")
        .eq("correo", user?.email ?? "")
        .maybeSingle();
      if (!cli?.legajo) return;
      setClienteCuit(digitsOnly(cli.cuit) || digitsOnly(cli.cuit_cuil));
      setClienteNombre(String(cli.nombre ?? ""));

      const { data: subs } = await sb
        .from("subaccounts")
        .select(`id, nombre, cbu, tipo, ${SALDOS_EMBED}`)
        .eq("cliente_legajo", cli.legajo)
        .order("nombre", { ascending: true });
      const lista = (subs ?? []).map(conSaldos);
      setSubcuentas(lista);
      setTotalDisponible(lista.reduce((s, x) => s + (Number(x.saldo_disponible) || 0), 0));

      const now = new Date();
      const primerDiaMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: movs } = await sb
        .from("transactions")
        .select("monto_operacion, tipo")
        .eq("legajo", cli.legajo)
        .gte("fecha", primerDiaMes)
        .in("tipo", ["transferencia"]);
      const movsArr = movs ?? [];
      setEnviadoMes({
        monto: movsArr.reduce((s, m) => s + (Number(m.monto_operacion) || 0), 0),
        ops: movsArr.length,
      });
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  /**
     /**
      * Drafts, scheduled transfers and frequent recipients live in Supabase: they are
      * reloaded on mount so they survive a reload / another tab / another device.
   */
  const cargarListas = useCallback(async () => {
    setListasError(null);
    try {
      const [b, p, f] = await Promise.all([
        listDrafts(),
        listScheduledTransfers(),
        listFrequentRecipients(),
      ]);
      setDrafts(b);
      setScheduled(p);
      setFrecuentes(f);
      // Templates (migration 1016) load separately on purpose: if the table
      // does not exist yet it must not break the other lists.
      try {
        setTemplates(await listTemplates());
        setTemplatesError(null);
      } catch (e) {
        setTemplatesError(toDataError(e).message);
      }
    } catch (e) {
      setListasError(toDataError(e).message);
    }
  }, []);

  useEffect(() => {
    void cargarListas();
  }, [cargarListas]);

  /** Refreshes scheduled transfers only (when opening that tab), in case the worker ran one. */
  const refreshScheduledTransfers = useCallback(async () => {
    try {
      setScheduled(await listScheduledTransfers());
    } catch {
      // el error de listas ya se muestra en la pantalla
    }
  }, []);

  /** Closes the dialog, switches tab and prefills the form. */
  const applyTemplate = (p: Template) => {
    setTemplatesOpen(false);
    setTab(p.tipo);
    setTemplatePrefill(p);
    toast.success(
      p.destinatario
        ? `Template "${p.nombre}" cargada`
        : `Template "${p.nombre}" cargada${p.monto != null ? ` — ${fmt(p.monto)}` : ""}. Elegi el CBU/CVU/alias del destinatario.`,
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
  const createTemplateQuick = async (input: {
    nombre: string;
    monto?: number;
    subcuentaOrigen?: string;
    concepto?: string;
  }): Promise<boolean> => {
    try {
      const fila = await createTemplate({
        nombre: input.nombre,
        tipo: "unica",
        monto: input.monto,
        subcuentaOrigen: input.subcuentaOrigen,
        concepto: input.concepto,
      });
      setTemplates((prev) =>
        [...prev.filter((x) => x.id !== fila.id), fila].sort((a, b) =>
          a.nombre.localeCompare(b.nombre),
        ),
      );
      toast.success(`Template "${fila.nombre}" guardada`);
      return true;
    } catch (e) {
      toast.error(toDataError(e).message);
      return false;
    }
  };

  /** Updates a template from the modal (name, amount, origin and concept). */
  const editTemplate = async (
    id: string,
    input: { nombre: string; monto?: number; subcuentaOrigen?: string; concepto?: string },
  ): Promise<boolean> => {
    try {
      const fila = await updateTemplate(id, input);
      setTemplates((prev) =>
        [...prev.filter((x) => x.id !== fila.id), fila].sort((a, b) =>
          a.nombre.localeCompare(b.nombre),
        ),
      );
      toast.success(`Template "${fila.nombre}" actualizada`);
      return true;
    } catch (e) {
      toast.error(toDataError(e).message);
      return false;
    }
  };

  const [otpSending, setOtpSending] = useState(false);

  const resetOtp = () => {
    setOtp(["", "", "", "", "", ""]);
    otpRefs.current[0]?.focus();
  };

  const enviarOtpCorreo = async () => {
    setOtpSending(true);
    try {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke("enviar-otp-transferencia", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.demo_codigo) {
        // Modo demo (sin Resend configurado): el código no se envía por correo.
        toast.info(`Modo demo: tu código es ${data.demo_codigo}`, { duration: 60_000 });
      } else {
        toast.success("Código enviado a tu correo");
      }
      return true;
    } catch (e) {
      const msg = (await extraerMensajeEdgeFunction(e)) || toDataError(e).message;
      toast.error(msg || "No se pudo enviar el código. Intenta reenviar.");
      return false;
    } finally {
      setOtpSending(false);
    }
  };

  const openOtp = async (payload: TransferPayload) => {
    setTransferPayload(payload);
    resetOtp();
    setOtpOpen(true);
    // Envía el código por Resend al correo autenticado (credenciales RESEND_API_KEY / RESEND_FROM)
    await enviarOtpCorreo();
  };

  const [transferPayload, setTransferPayload] = useState<TransferPayload | null>(null);

  const [otpVerifying, setOtpVerifying] = useState(false);

  const confirmWithOtp = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      toast.error("Ingresa el código de 6 dígitos");
      return;
    }
    if (!transferPayload) {
      toast.error("No hay datos de transferencia para confirmar");
      return;
    }
    setOtpVerifying(true);
    try {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke("verificar-otp-transferencia", {
        body: { codigo: code },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.ok) throw new Error("Código no válido");
    } catch (e) {
      const msg = (await extraerMensajeEdgeFunction(e)) || toDataError(e).message;
      toast.error(msg || "Código incorrecto o expirado");
      setOtpVerifying(false);
      return;
    }
    setOtpVerifying(false);
    setOtpOpen(false);
    setConfirm(false);
    const payloadTrasOtp = transferPayload;
    if (payloadTrasOtp) await ejecutarTransferencia(payloadTrasOtp);
  };

  /**
   * Runs the transfer with the payload already built (bank + record in `movimientos`).
   * It is separate from the OTP check so it can be skipped when `OTP_ENABLED` is false.
   */
  const ejecutarTransferencia = async (payload: TransferPayload) => {
    try {
      /** Subcuenta de origen (para el comprobante). */
      const origenDe = (id: string) => subcuentas.find((x) => x.id === id);

      if (canTransferBdc()) {
        const bdc = createBdcClient();
        const sub = subcuentas.find((s) => s.id === payload.subcuentaOrigen);

        const cbuOrigen = sub?.cbu ?? "";
        const cuitOrigen = digitsOnly(clienteCuit);
        if (!cbuOrigen)
          throw new Error("La subcuenta seleccionada no tiene CBU/CVU de origen configurado.");
        if (!cuitOrigen)
          throw new Error(
            "El cliente/empresa no tiene CUIT cargado. No se puede enviar la transferencia al banco.",
          );

        const desde: BdcAccount = {
          address: cbuOrigen,
          personId: cuitOrigen,
        };
        const cuitDestino = digitsOnly(payload.destinatarioCuit);
        if (!cuitDestino) throw new Error("El destinatario no tiene CUIT validado por el banco.");
        const hasta: BdcAccount = {
          address: payload.destinatarioCbu,
          personId: cuitDestino,
        };

        const originId = `TRF${Date.now()}`; // BDC exige <=22 chars y solo [a-zA-Z0-9]

        // 1) Reservar ANTES de enviar: si no alcanza (monto + comisión + IVA) falla
        //    acá y el banco nunca recibe el pedido.
        setProcesando({ paso: "reserva", monto: payload.monto });
        const reserva = await reserveBdcTransfer({
          subcuentaOrigen: payload.subcuentaOrigen,
          originId,
          destinatarioCbu: payload.destinatarioCbu,
          destinatarioNombre: payload.destinatarioNombre,
          destinatarioCuit: payload.destinatarioCuit,
          destinatarioBanco: payload.destinatario?.banco ?? null,
          monto: payload.monto,
          concepto: payload.concepto || null,
        });
        const comision = Number(reserva.comision);
        const impuesto = Number(reserva.impuesto);

        // 2) Enviar. Si el pedido falla se pregunta al banco antes de liberar la
        //    reserva: un timeout puede haber ejecutado igual la transferencia.
        let envioMensaje: string | undefined;
        setProcesando({ paso: "envio", monto: payload.monto });
        try {
          await bdc.autenticar();
          const envio = await bdc.transferir({
            originId,
            desde,
            hasta,
            importe: payload.monto,
            descripcion: payload.concepto || `Transferencia ${brand.name}`,
          });
          envioMensaje = envio.message;
        } catch (e) {
          const existe = await bdc.consultarTransferencia(originId).then(
            (r) => Boolean(r?.data),
            () => false,
          );
          if (!existe) {
            await cancelBdcTransfer(originId, toDataError(e).message).catch(() => {});
            throw e;
          }
        }

        let estado = "";
        try {
          const consulta = await bdc.consultarTransferencia(originId);
          estado = consulta?.data?.estado ?? "";
        } catch {
          // la consulta de estado es informativa: no frená la operación
        }

        // 3) Contabilizar: retenido -> banco + comisión + IVA. Idempotente por TXID.
        //    Si falla, el dinero ya salió y queda reservado (retenido): se avisa
        //    para confirmarlo desde backoffice, nunca se libera.
        setProcesando({ paso: "confirmacion", monto: payload.monto });
        try {
          await confirmBdcTransfer(originId, estado || null);
        } catch (e) {
          toast.error(
            `Transferencia enviada al banco, pero no se pudo contabilizar: ${toDataError(e).message}. Los fondos quedan retenidos; avisá a soporte con el TXID ${originId}.`,
          );
        }

        toast.success(
          `Transferencia enviada al banco — TXID: ${originId}${estado ? ` · ${estado}` : ""}`,
        );
        setTransferSuccess({
          txid: originId,
          estado,
          mensaje: envioMensaje ?? "Transferencia creada con exito",
          monto: payload.monto,
          concepto: payload.concepto,
          origenNombre: origenDe(payload.subcuentaOrigen)?.nombre,
          origenCbu: origenDe(payload.subcuentaOrigen)?.cbu ?? undefined,
          destino: payload.destinatarioCbu,
          comision,
          impuesto,
          fecha: new Date().toISOString(),
        });
        setDestAlias(
          payload.destinatarioAlias ||
            payload.destinatarioNombre ||
            payload.destinatarioCbu.slice(0, 10) + "...",
        );
        setDestValidation({
          status: "valid",
          ok: true,
          kind: detectIdentifierKind(payload.destinatarioCbu),
          identifier: payload.destinatarioCbu,
          provider: "bdc",
          titular: payload.destinatario ?? {
            nombre: payload.destinatarioNombre,
            cuit: payload.destinatarioCuit,
            cbu: payload.destinatarioCbu,
            alias: payload.destinatarioAlias,
          },
          validatedAt: new Date().toISOString(),
        });
        setSaveDestOpen(true);
        setTransferPayload(null);
        await cargarDatos();
        return;
      }

      // Flujo desacoplado: validación → ejecución → movimiento
      setProcesando({ paso: "envio", monto: payload.monto });
      const result = await executeTransfer({
        subcuentaOrigenId: payload.subcuentaOrigen,
        destinatarioIdentifier: payload.destinatarioCbu,
        monto: payload.monto,
        concepto: payload.concepto || null,
      });
      if (!result.ok) {
        const msg =
          result.validation.status === "not_found"
            ? "Destinatario no encontrado"
            : result.validation.status === "rejected"
              ? "Validación rechazada"
              : result.validation.status === "timeout"
                ? "Timeout validando destinatario"
                : (result.error ?? "Validación fallida");
        toast.error(msg);
        return;
      }
      toast.success(`Transferencia enviada — TXID: ${result.txn.id_txn}`);
      setTransferSuccess({
        txid: result.txn.id_txn,
        mensaje: "Transferencia registrada correctamente",
        monto: payload.monto,
        concepto: payload.concepto,
        origenNombre: origenDe(payload.subcuentaOrigen)?.nombre,
        origenCbu: origenDe(payload.subcuentaOrigen)?.cbu ?? undefined,
        destino: payload.destinatarioCbu,
        comision: result.txn.comision,
        impuesto: result.txn.impuesto,
        fecha: new Date().toISOString(),
      });
      setDestAlias(
        result.validation.titular?.alias ?? payload.destinatarioCbu.slice(0, 10) + "...",
      );
      setDestValidation(result.validation);
      setSaveDestOpen(true);
      setTransferPayload(null);
      await cargarDatos();
    } catch (e) {
      const err = toDataError(e);
      if (isPermissionError(e)) {
        toast.error("Sin permisos para realizar esta transferencia");
      } else {
        toast.error(err.message || "No se pudo enviar la transferencia");
      }
    } finally {
      setProcesando(null);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "unica", label: "Transferencia unica" },
    { key: "programar", label: "Programar" },
    { key: "borradores", label: "Borradores" },
    { key: "programadas", label: "Transferencias programadas" },
    { key: "destinatarios", label: "Destinatarios frecuentes" },
  ];

  return (
    <>
      <PageHeader
        title="Transferir"
        description="Envios inmediatos, programados y a CBU, CVU o alias."
        action={
          <BtnOutline onClick={() => setTemplatesOpen(true)}>
            <FileText size={14} /> Plantillas
          </BtnOutline>
        }
      />

      {listasError && (
        <div className="mb-4 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No se pudieron cargar tus listas guardadas: {listasError}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Disponible hoy
          </div>
          <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
            {fmt(totalDisponible)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {subcuentas.length} subcuentas
          </div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Enviado este mes
          </div>
          <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
            {fmt(enviadoMes.monto)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {enviadoMes.ops} operaciones
          </div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Programadas
          </div>
          <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
            {scheduled.length}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Subcuentas
          </div>
          <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
            {subcuentas.length}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">activas</div>
        </div>
      </div>

      <div className="bg-card border rounded-lg mb-6 overflow-hidden">
        <div className="md:grid md:grid-cols-[220px_1fr]">
          <nav className="flex md:flex-col overflow-x-auto overflow-y-hidden md:overflow-visible border-b md:border-b-0 md:border-r bg-muted/10">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  // Al salir de "Programar" se cancela cualquier edicion abierta.
                  if (t.key !== "programar") setEditingScheduled(null);
                  // Refresh when entering the scheduled tab: the worker may have run something.
                  if (t.key === "programadas") void refreshScheduledTransfers();
                  setTab(t.key);
                }}
                className={`shrink-0 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 md:border-b-0 md:border-l-2 md:text-left transition-colors ${
                  tab === t.key
                    ? "border-primary text-primary-ink bg-[color:var(--brand-primary-50)]/50 md:bg-[color:var(--brand-primary-50)]/40"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="p-5">
            {tab === "unica" && (
              <Unica
                confirm={confirm}
                setConfirm={setConfirm}
                onOtpRequired={async (payload) => {
                  // 2FA disabled (OTP_ENABLED = false): the transfer runs straight away.
                  // To restore the OTP step set OTP_ENABLED to true at the top of this file.
                  //
                  if (OTP_ENABLED) {
                    await openOtp(payload);
                    return;
                  }
                  setConfirm(false);
                  await ejecutarTransferencia(payload);
                }}
                subcuentas={subcuentas}
                onTransferPayload={setTransferPayload}
                frecuentes={frecuentes}
                onSaveDraft={async (d) => {
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
                }}
                prefilledDestinatario={prefilledDestinatario}
                onClearPrefill={() => setPrefilledDestinatario(undefined)}
                template={templatePrefill}
                onClearTemplate={() => setTemplatePrefill(null)}
              />
            )}
            {tab === "programar" && (
              <Programar
                subcuentas={subcuentas}
                frecuentes={frecuentes}
                programada={editingScheduled}
                onCancelarEdicion={() => {
                  setEditingScheduled(null);
                  setTab("programadas");
                }}
                template={templatePrefill}
                onClearTemplate={() => setTemplatePrefill(null)}
                onSuccess={(s) => {
                  const editando = editingScheduled?.id === s.id;
                  setScheduled((prev) =>
                    (prev.some((x) => x.id === s.id)
                      ? prev.map((x) => (x.id === s.id ? s : x))
                      : [s, ...prev]
                    ).sort((a, b) =>
                      `${a.fechaISO ?? ""}${a.hora}`.localeCompare(`${b.fechaISO ?? ""}${b.hora}`),
                    ),
                  );
                  setEditingScheduled(null);
                  toast.success(
                    editando ? "Transferencia programada actualizada" : "Transferencia programada",
                  );
                  setTab("programadas");
                }}
              />
            )}
            {tab === "borradores" && (
              <Borradores
                drafts={drafts}
                onDelete={(id) => setConfirmarEliminacion({ tipo: "borrador", id })}
                onEdit={(id) => {
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
                }}
                onExecute={async (id) => {
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
                }}
              />
            )}
            {tab === "programadas" && (
              <Programadas
                items={scheduled}
                onCancel={(id) => {
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
                }}
                onEdit={(id) => {
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
                }}
                onExecute={async (id) => {
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
                    setScheduled((prev) =>
                      prev.map((x) => (x.id === id ? { ...x, estado: "Ejecutada" } : x)),
                    );
                    toast.success(`Scheduled ejecutada — TXID: ${res.txn.id_txn}`);
                    await cargarDatos();
                  } catch (e) {
                    toast.error(toDataError(e).message);
                  }
                }}
              />
            )}
            {tab === "destinatarios" && (
              <DestinatariosList
                items={frecuentes}
                onSelect={(d) => {
                  setPrefilledDestinatario(d);
                  setTab("unica");
                  toast.success("Destinatario cargado");
                }}
                onDelete={async (id) => {
                  try {
                    await deleteFrequentRecipient(id);
                    setFrecuentes((prev) => prev.filter((x) => x.id !== id));
                    toast.success("Destinatario eliminado");
                  } catch (e) {
                    toast.error(toDataError(e).message);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      <PlantillasDialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        templates={templates}
        error={templatesError}
        subcuentas={subcuentas}
        onAplicar={applyTemplate}
        onBorrar={handleDeleteTemplate}
        onCrear={createTemplateQuick}
        onEditar={editTemplate}
      />

      <FormDialog
        open={otpOpen}
        onClose={() => {
          if (!otpVerifying && !otpSending) setOtpOpen(false);
        }}
        title="Verificacion de dos factores"
        description={
          otpSending
            ? "Enviando código a tu correo..."
            : "Ingresa el codigo de 6 digitos enviado a tu correo."
        }
        submitLabel={
          otpVerifying
            ? "Verificando..."
            : otpSending
              ? "Enviando código..."
              : "Verificar y confirmar"
        }
        onSubmit={confirmWithOtp}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 py-2">
            <KeyRound size={18} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {otpSending ? "Enviando código..." : "Codigo de verificacion"}
            </span>
          </div>
          <div className="flex justify-center gap-2">
            {otp.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  // Soporta pegar código completo en una sola casilla
                  if (raw.length > 1) {
                    const digits = raw.slice(0, 6).split("");
                    const next = Array(6)
                      .fill("")
                      .map((_, idx) => digits[idx] ?? "");
                    setOtp(next);
                    const last = Math.min(digits.length, 6) - 1;
                    otpRefs.current[last]?.focus();
                    return;
                  }
                  const val = raw.slice(0, 1);
                  const next = [...otp];
                  next[i] = val;
                  setOtp(next);
                  if (val && i < 5) otpRefs.current[i + 1]?.focus();
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                  if (!pasted) return;
                  const digits = pasted.split("");
                  const next = Array(6)
                    .fill("")
                    .map((_, idx) => digits[idx] ?? "");
                  setOtp(next);
                  const focusIdx = Math.min(digits.length, 6) - 1;
                  otpRefs.current[focusIdx]?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
                }}
                onFocus={(e) => e.target.select()}
                className="w-11 h-12 text-center text-lg font-bold rounded-md border bg-card outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                autoComplete="one-time-code"
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground pt-1">
            <span>¿No recibiste el codigo?</span>
            <button
              type="button"
              className="text-primary-ink font-semibold hover:underline disabled:opacity-50"
              disabled={otpSending}
              onClick={async () => {
                resetOtp();
                const ok = await enviarOtpCorreo();
                if (ok) toast.success("Nuevo código enviado");
              }}
            >
              {otpSending ? "Enviando..." : "Reenviar"}
            </button>
          </div>
        </div>
      </FormDialog>

      {procesando && <TransferProcessingOverlay paso={procesando.paso} monto={procesando.monto} />}

      {saveDestOpen &&
        transferSuccess &&
        transferSuccess.monto != null &&
        (() => {
          const titular = destValidation?.titular;
          const cerrar = () => {
            setSaveDestOpen(false);
            setTransferSuccess(null);
            setDestValidation(null);
          };
          const comprobante = comprobanteDe(transferSuccess, titular, clienteNombre, clienteCuit);
          return (
            <TransferReceiptModal
              recibo={{
                monto: transferSuccess.monto,
                fecha: transferSuccess.fecha ?? new Date().toISOString(),
                txid: transferSuccess.txid,
                estado: transferSuccess.estado || undefined,
                concepto: transferSuccess.concepto,
                comision: transferSuccess.comision,
                impuesto: transferSuccess.impuesto,
                origen: {
                  nombre: clienteNombre,
                  cuit: clienteCuit,
                  subcuenta: transferSuccess.origenNombre,
                  cvu: transferSuccess.origenCbu,
                },
                destino: {
                  nombre: titular?.nombre ?? destAlias,
                  cuit: titular?.cuit,
                  banco:
                    [titular?.banco, titular?.bancoCodigo ? `(${titular.bancoCodigo})` : ""]
                      .filter(Boolean)
                      .join(" ") || undefined,
                  cvu: titular?.cbu ?? transferSuccess.destino,
                  alias: titular?.alias || undefined,
                },
              }}
              onClose={cerrar}
              onDescargar={() => {
                if (comprobante) descargarComprobantePdf(comprobante);
              }}
              onCompartir={async () => {
                if (!comprobante) return;
                const r = await compartirComprobante(comprobante);
                if (r === "compartido") toast.success("Comprobante compartido");
                else if (r === "descargado")
                  toast.info(
                    "Tu navegador no comparte archivos: se descargó el comprobante para adjuntarlo.",
                  );
                else if (r === "error") toast.error("No se pudo compartir el comprobante");
              }}
              onGuardarDestinatario={
                titular && !frecuentes.some((f) => f.cbu === titular.cbu)
                  ? async () => {
                      try {
                        await createFrequentRecipient({
                          identifier: destValidation!.identifier,
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
                    }
                  : undefined
              }
            />
          );
        })()}

      <ConfirmDialog
        open={confirmarEliminacion !== null}
        title={
          confirmarEliminacion?.tipo === "borrador"
            ? "¿Eliminar borrador?"
            : "¿Cancelar transferencia programada?"
        }
        description="Esta accion no se puede deshacer."
        confirmLabel={confirmarEliminacion?.tipo === "borrador" ? "Eliminar" : "Cancelar"}
        onClose={() => setConfirmarEliminacion(null)}
        onConfirm={async () => {
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
        }}
      />
    </>
  );
}

/* ===== Transferencia unica ===== */

/* ===== Plantillas ===== */
/**
 * Templates dialog: list, apply, create, edit and delete. Templates are generic
 * (name + amount, no recipient): the CBU/CVU/alias is chosen when applying them.
 * CBU/CVU/alias de la persona.
 */
function PlantillasDialog({
  open,
  onClose,
  templates,
  error,
  subcuentas,
  onAplicar,
  onBorrar,
  onCrear,
  onEditar,
}: {
  open: boolean;
  onClose: () => void;
  templates: Template[];
  /** Shown when the table does not exist yet (migration 1016). */
  error?: string | null;
  subcuentas: Subcuenta[];
  onAplicar: (p: Template) => void;
  onBorrar: (p: Template) => void | Promise<void>;
  onCrear: (input: {
    nombre: string;
    monto?: number;
    subcuentaOrigen?: string;
    concepto?: string;
  }) => Promise<boolean>;
  onEditar: (
    id: string,
    input: { nombre: string; monto?: number; subcuentaOrigen?: string; concepto?: string },
  ) => Promise<boolean>;
}) {
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [subcuentaOrigen, setSubcuentaOrigen] = useState("");
  const [concepto, setConcepto] = useState("Pago a proveedor");
  const [creando, setCreando] = useState(false);
  /** Template being edited (null = creating a new one). */
  const [editando, setEditando] = useState<Template | null>(null);

  const guardar = async () => {
    if (creando) return;
    if (!nombre.trim()) {
      toast.error("Ponele un nombre a la plantilla");
      return;
    }
    const montoNum = monto.trim()
      ? Number(monto.trim().replace(/\./g, "").replace(",", "."))
      : undefined;
    if (monto.trim() && (!montoNum || Number.isNaN(montoNum) || montoNum <= 0)) {
      toast.error("Ingresa un monto valido o dejalo vacio");
      return;
    }
    setCreando(true);
    try {
      const datos = {
        nombre: nombre.trim(),
        monto: montoNum,
        subcuentaOrigen: subcuentaOrigen || undefined,
        concepto: concepto || undefined,
      };
      const ok = editando ? await onEditar(editando.id, datos) : await onCrear(datos);
      if (ok) {
        setNombre("");
        setMonto("");
        setSubcuentaOrigen("");
        setConcepto("Pago a proveedor");
        setEditando(null);
      }
    } finally {
      setCreando(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={() => {
        setEditando(null);
        setNombre("");
        setMonto("");
        setSubcuentaOrigen("");
        onClose();
      }}
      title="Plantillas de transferencia"
      description="Selecciona una plantilla para precargar el formulario."
      submitLabel={creando ? "Guardando..." : editando ? "Guardar cambios" : "Crear plantilla"}
      size="lg"
      onSubmit={() => {
        void guardar();
      }}
    >
      {error && (
        <div className="mb-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}
      <div className="divide-y border rounded-md max-h-64 overflow-y-auto">
        {templates.length === 0 ? (
          <div className="p-5 text-center text-sm text-muted-foreground">
            Todavia no tenes templates. Crea una abajo o guardala desde el formulario de
            transferencia.
          </div>
        ) : (
          templates.map((p) => {
            const origen = p.subcuentaOrigen
              ? subcuentas.find((s) => s.id === p.subcuentaOrigen)?.nombre
              : undefined;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 p-3 hover:bg-muted/50 cursor-pointer"
                onClick={() => onAplicar(p)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-md bg-[color:var(--brand-primary-50)] flex items-center justify-center shrink-0">
                    <Star size={14} className="text-[color:var(--brand-primary-700)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.nombre}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.destinatario
                        ? `${p.destinatario.nombre}${p.destinatario.alias ? ` · @${p.destinatario.alias}` : ""}`
                        : p.monto != null
                          ? fmt(p.monto)
                          : "Sin monto"}
                      {p.concepto ? ` · ${p.concepto}` : ""}
                      {origen ? ` · ${origen}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold">
                    {p.monto != null ? fmt(p.monto) : "—"}
                  </span>
                  <button
                    type="button"
                    title="Editar plantilla"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditando(p);
                      setNombre(p.nombre);
                      setMonto(p.monto != null ? String(p.monto) : "");
                      setSubcuentaOrigen(p.subcuentaOrigen ?? "");
                      setConcepto(p.concepto || "Pago a proveedor");
                    }}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent text-muted-foreground"
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    type="button"
                    title="Eliminar plantilla"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onBorrar(p);
                    }}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-danger-50 text-muted-foreground hover:text-danger-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="pt-3 space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{editando ? "Nombre" : "Nueva plantilla"}</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Sueldos mensuales"
            />
          </div>
          <div>
            <Label>Monto ($)</Label>
            <Input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Ej. 482000"
              inputMode="decimal"
            />
          </div>
          <div>
            <Label>Origen de fondos (opcional)</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={subcuentaOrigen}
              onChange={(e) => setSubcuentaOrigen(e.target.value)}
            >
              <option value="">Sin especificar</option>
              {subcuentas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {fmt(Number(s.saldo_disponible))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Concepto</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            >
              <option>Pago a proveedor</option>
              <option>Sueldos</option>
              <option>Honorarios</option>
              <option>Servicios</option>
              <option>Devolucion</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Al usar la template se precargan el monto, el concepto y el origen. El destinatario
          (CBU/CVU/alias) lo elegis en ese momento.
        </p>
      </div>
    </FormDialog>
  );
}

function Unica({
  confirm,
  setConfirm,
  onOtpRequired,
  subcuentas,
  onTransferPayload,
  onSaveDraft,
  frecuentes,
  prefilledDestinatario,
  onClearPrefill,
  template,
  onClearTemplate,
}: {
  confirm: boolean;
  setConfirm: (v: boolean) => void;
  onOtpRequired: (payload: TransferPayload) => void | Promise<void>;
  subcuentas: Subcuenta[];
  onTransferPayload: (p: TransferPayload) => void;
  onSaveDraft: (d: Draft) => void | Promise<void>;
  frecuentes: FrequentRecipient[];
  prefilledDestinatario?: CoelsaResult;
  onClearPrefill?: () => void;
  template?: Template | null;
  onClearTemplate?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectedDestinatario, setSelectedDestinatario] = useState<CoelsaResult | null>(
    () => prefilledDestinatario ?? null,
  );
  const [frecuentesOpen, setFrecuentesOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const [subcuentaOrigen, setSubcuentaOrigen] = useState("");
  const [concepto, setConcepto] = useState("Pago a proveedor");

  useEffect(() => {
    if (subcuentas.length > 0 && !subcuentaOrigen) {
      setSubcuentaOrigen(subcuentas[0].id);
    }
  }, [subcuentas, subcuentaOrigen]);

  useEffect(() => {
    if (prefilledDestinatario) {
      onClearPrefill?.();
      setSearchQuery(prefilledDestinatario.cbu);
      setSelectedDestinatario(prefilledDestinatario);
      // El frecuente guarda solo nombre/CUIT/CBU/alias: se revalida contra el banco
      // para traer el resto del detalle (banco, tipo de cuenta, moneda, estado) sin
      // que haya que apretar "Validar".
      void handleSearch(prefilledDestinatario.cbu);
    }
  }, [prefilledDestinatario, onClearPrefill]);

  // Template picked in the dialog: prefills recipient, amount, concept and subaccount.
  // Declared AFTER the effect that sets the first subaccount, so this one wins.
  //
  useEffect(() => {
    if (!template) return;
    const d = template.destinatario;
    if (d?.cbu) {
      setSearchQuery(d.cbu);
      setSelectedDestinatario({
        nombre: d.nombre,
        cuit: d.cuit ?? "",
        cbu: d.cbu,
        alias: d.alias ?? "",
      });
      // Misma idea que con los frecuentes: revalidar para tener el detalle del banco.
      void handleSearch(d.cbu);
    }
    // Generic template (e.g. "Sueldos"): the recipient is NOT touched. If one is already
    // picked it is kept; otherwise the user searches for each person.
    if (template.monto != null) setMonto(String(template.monto));
    if (template.concepto) setConcepto(template.concepto);
    if (template.subcuentaOrigen) setSubcuentaOrigen(template.subcuentaOrigen);
    onClearTemplate?.();
  }, [template, onClearTemplate]);

  const saveAsDraft = async () => {
    // Mismo criterio que "Continuar": si el destinatario no esta validado se
    // valida aca (antes hacia un return silencioso y parecia que no guardaba).
    const dest = selectedDestinatario ?? (await handleSearch());
    if (!dest) return;

    const amount = Number(monto) || 0;
    if (!amount || amount <= 0) {
      toast.error("Ingresa un monto valido para guardar el borrador");
      return;
    }
    if (!subcuentaOrigen) {
      toast.error("Selecciona una subcuenta de origen");
      return;
    }

    // The draft is persisted in `transferencias_borrador` (via transfer-store);
    // here the row is only assembled. It creates no movement: when executed it goes
    // through validation -> execution -> movement.
    await onSaveDraft({
      id: `d${Date.now()}`,
      destinatario: dest.nombre,
      alias: dest.alias,
      cbu: dest.cbu,
      cuit: dest.cuit,
      subcuentaOrigen,
      montoNum: amount,
      monto: `$ ${amount.toLocaleString("es-AR")}`,
      concepto,
      ref: "",
      fecha: new Date().toLocaleDateString("es-AR"),
    });
  };

  /** Vuelve el formulario a cero (para salir sin guardar nada). */
  const resetForm = () => {
    setSelectedDestinatario(null);
    setSearchQuery("");
    setMonto("");
    setConcepto("Pago a proveedor");
    setConfirm(false);
    toast.success("Formulario limpiado");
  };

  /** Validates the recipient typed in the field. Returns the holder or null. */
  const handleSearch = async (identifier?: string): Promise<CoelsaResult | null> => {
    const q = (identifier ?? searchQuery).trim();
    if (!q) {
      toast.error("Ingresa el CBU/CVU o alias del destinatario");
      return null;
    }
    setSearching(true);
    try {
      const res = await validateRecipient(q, detectIdentifierKind(q));
      if (res.ok && res.titular) {
        onClearPrefill?.();
        const titular: CoelsaResult = {
          nombre: res.titular.nombre,
          cuit: res.titular.cuit,
          cbu: res.titular.cbu,
          alias: res.titular.alias,
          banco: res.titular.banco,
          bancoCodigo: res.titular.bancoCodigo,
          tipoCuenta: res.titular.tipoCuenta,
          moneda: res.titular.moneda,
          activa: res.titular.activa,
          tipoPersona: res.titular.tipoPersona,
          tipoDoc: res.titular.tipoDoc,
        };
        setSelectedDestinatario(titular);
        if (res.provider === "bdc") {
          toast.success("Titular verificado por Banco de Comercio");
        }
        return titular;
      }
      const msg =
        res.status === "invalid_format"
          ? "Formato inválido: CBU/CVU 22 dígitos o Alias 6-20 caracteres"
          : res.status === "not_found"
            ? "Destinatario no encontrado"
            : res.status === "rejected"
              ? "Validación rechazada"
              : (res.errorMessage ?? "No se pudo validar el destinatario");
      toast.error(msg);
      return null;
    } catch {
      toast.error("Error validando destinatario");
      return null;
    } finally {
      setSearching(false);
    }
  };

  const subcuentaSeleccionada = subcuentas.find((s) => s.id === subcuentaOrigen);
  const montoNumero = Number(monto) || 0;
  const disponibleOrigen = Number(subcuentaSeleccionada?.saldo_disponible ?? 0);
  // Validacion en tiempo real: monto + comision + IVA contra el disponible del origen.
  const cot = useCotizacion(
    subcuentaOrigen,
    montoNumero,
    selectedDestinatario?.cbu ?? null,
    disponibleOrigen,
  );

  if (confirm) {
    const montoNum = montoNumero;
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">Revisa los datos antes de confirmar.</div>
        <div className="border rounded-md divide-y">
          {[
            ["Origen", subcuentaSeleccionada?.nombre ?? "—"],
            ["CBU Origen", subcuentaSeleccionada?.cbu ?? "—"],
            ["Destinatario", selectedDestinatario?.nombre ?? "-"],
            [selectedDestinatario?.tipoDoc || "CUIT", selectedDestinatario?.cuit || "—"],
            ["CBU/CVU Destino", selectedDestinatario?.cbu ?? "-"],
            [
              "Banco",
              [
                selectedDestinatario?.banco,
                selectedDestinatario?.bancoCodigo ? `(${selectedDestinatario.bancoCodigo})` : "",
              ]
                .filter(Boolean)
                .join(" ") || "—",
            ],
            ["Tipo de cuenta", selectedDestinatario?.tipoCuenta || "—"],
            ["Monto", fmt(montoNum)],
            ["Comisión", cot.cotizacion ? fmt(cot.cotizacion.comision) : "—"],
            ["IVA", cot.cotizacion ? fmt(cot.cotizacion.impuesto) : "—"],
            ["Total a debitar", cot.cotizacion ? fmt(cot.cotizacion.total) : fmt(montoNum)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2.5 px-3 text-sm">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono tabular-nums font-semibold">{v}</span>
            </div>
          ))}
        </div>
        {cot.insuficiente && (
          <div
            className="rounded-md border border-danger-300 bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-700"
            role="alert"
          >
            Saldo insuficiente: te faltan {fmt(cot.faltante)}. Volvé y ajustá el monto o el origen.
          </div>
        )}
        {OTP_ENABLED && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-muted rounded">
            <ShieldCheck size={14} /> Se solicitara 2FA al confirmar.
          </div>
        )}
        <div className="flex gap-2">
          <BtnOutline onClick={() => setConfirm(false)} className="flex-1">
            Volver
          </BtnOutline>
          <BtnPrimary
            type="button"
            disabled={cot.insuficiente || cot.cargando}
            onClick={async () => {
              if (!subcuentaOrigen) {
                toast.error("Selecciona una subcuenta de origen");
                return;
              }
              if (!selectedDestinatario) {
                toast.error("Falta destinatario validado");
                return;
              }
              if (!montoNum || montoNum <= 0) {
                toast.error("Ingresa un monto válido mayor a 0");
                return;
              }
              if (cot.insuficiente) {
                toast.error("Saldo insuficiente en la subcuenta de origen");
                return;
              }
              const payload: TransferPayload = {
                subcuentaOrigen,
                destinatarioCbu: selectedDestinatario.cbu,
                destinatarioCuit: selectedDestinatario.cuit,
                destinatarioNombre: selectedDestinatario.nombre,
                destinatarioAlias: selectedDestinatario.alias,
                destinatario: selectedDestinatario,
                monto: montoNum,
                concepto,
              };
              onTransferPayload(payload);
              await onOtpRequired(payload);
            }}
            className="flex-1"
          >
            Confirmar transferencia
          </BtnPrimary>
        </div>
      </div>
    );
  }

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          // If the recipient is not validated (or the text changed), validate here
          // before moving on to the confirmation screen.
          if (!selectedDestinatario) {
            if (!(await handleSearch())) return;
          }
          if (!monto || Number(monto) <= 0) {
            toast.error("Ingresa un monto valido");
            return;
          }
          if (cot.insuficiente) {
            toast.error("Saldo insuficiente en la subcuenta de origen");
            return;
          }
          setConfirm(true);
        }}
      >
        <div>
          <Label>Destinatario (CBU/CVU/Alias)</Label>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder="22 digitos o alias (6-20)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // Si cambia el texto, la validacion anterior deja de valer.
                setSelectedDestinatario(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSearch();
                }
              }}
              disabled={searching}
            />
            <BtnOutline
              type="button"
              onClick={() => {
                void handleSearch();
              }}
              disabled={searching}
            >
              {searching ? "Validando..." : "Validar"}
            </BtnOutline>
          </div>
          {selectedDestinatario ? (
            <DestinatarioValidadoCard d={selectedDestinatario} />
          ) : (
            <div className="text-xs text-muted-foreground mt-1">
              Se valida contra el banco (/accounts/info) antes de continuar.
            </div>
          )}
          <BtnOutline type="button" onClick={() => setFrecuentesOpen(true)} className="w-full mt-2">
            <Users size={14} /> Destinatarios frecuentes
          </BtnOutline>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Origen de fondos</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={subcuentaOrigen}
              onChange={(e) => setSubcuentaOrigen(e.target.value)}
            >
              {subcuentas.length === 0 && <option value="">Sin subcuentas</option>}
              {subcuentas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {fmt(Number(s.saldo_disponible))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Monto</Label>
            <Input
              type="number"
              placeholder="$ 0,00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              min="0"
              step="0.01"
              aria-invalid={cot.insuficiente}
              className={
                cot.insuficiente
                  ? "!border-danger-400 !text-danger-700 focus:!ring-danger-100"
                  : undefined
              }
            />
          </div>
          <div>
            <Label>Moneda</Label>
            <div className="h-10 px-3 rounded-md border bg-muted flex items-center text-sm text-muted-foreground">
              ARS — Pesos Argentinos
            </div>
          </div>
          <div className="sm:col-span-2 -mt-1">
            <ResumenCotizacion
              monto={montoNumero}
              disponible={disponibleOrigen}
              cotizacion={cot.cotizacion}
              cargando={cot.cargando}
              insuficiente={cot.insuficiente}
              faltante={cot.faltante}
            />
          </div>
          <div>
            <Label>Concepto</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            >
              <option>Pago a proveedor</option>
              <option>Sueldos</option>
              <option>Honorarios</option>
              <option>Servicios</option>
              <option>Devolucion</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <BtnOutline type="button" className="flex-1 min-w-[130px]" onClick={resetForm}>
            <X size={14} /> Cancelar
          </BtnOutline>
          <BtnOutline
            type="button"
            className="flex-1 min-w-[130px]"
            onClick={() => {
              void saveAsDraft();
            }}
          >
            <Save size={14} /> Guardar borrador
          </BtnOutline>
          <BtnPrimary type="submit" className="flex-1 min-w-[130px]" disabled={cot.insuficiente}>
            Continuar
          </BtnPrimary>
        </div>
      </form>

      <FormDialog
        open={frecuentesOpen}
        onClose={() => setFrecuentesOpen(false)}
        title="Destinatarios frecuentes"
        description="Selecciona un destinatario de tu lista."
        submitLabel="Cerrar"
        onSubmit={() => setFrecuentesOpen(false)}
        size="md"
      >
        {frecuentes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No tenes destinatarios frecuentes guardados.
          </div>
        ) : (
          <div className="divide-y border rounded-md max-h-64 overflow-y-auto">
            {frecuentes.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onClearPrefill?.();
                  setSearchQuery(f.cbu);
                  setSelectedDestinatario({
                    nombre: f.nombre,
                    cuit: f.cuit,
                    cbu: f.cbu,
                    alias: f.alias,
                  });
                  setFrecuentesOpen(false);
                  // Se revalida contra el banco para completar la ficha (banco, tipo
                  // de cuenta, moneda, estado) sin tener que apretar "Validar".
                  void handleSearch(f.cbu);
                }}
                className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{f.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {f.alias ? `@${f.alias} · ` : ""}
                    <span className="font-mono">{f.cbu}</span>
                  </div>
                </div>
                {f.banco && (
                  <span className="text-[11px] text-muted-foreground shrink-0">{f.banco}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </FormDialog>
    </>
  );
}

/* ===== Programar ===== */
function Programar({
  subcuentas,
  frecuentes = [],
  onSuccess,
  template,
  onClearTemplate,
  programada,
  onCancelarEdicion,
}: {
  subcuentas: Subcuenta[];
  /** Frequent recipients to pick from the list (same as in the single transfer). */
  frecuentes?: FrequentRecipient[];
  onSuccess: (s: Scheduled) => void | Promise<void>;
  template?: Template | null;
  onClearTemplate?: () => void;
  /** When provided, this scheduled transfer is being EDITED instead of created. */
  programada?: Scheduled | null;
  /** Leaves edit mode (goes back to the scheduled list). */
  onCancelarEdicion?: () => void;
}) {
  const editando = Boolean(programada);
  const [confirm, setConfirm] = useState(false);
  const [frecuentesOpen, setFrecuentesOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [destQuery, setDestQuery] = useState("");
  const [destValid, setDestValid] = useState<
    import("@/lib/recipient-validation").RecipientValidationResult | null
  >(null);
  const [validating, setValidating] = useState(false);
  const [subcuentaOrigen, setSubcuentaOrigen] = useState(subcuentas[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("14:30");
  const [concepto, setConcepto] = useState("Pago a proveedor");

  // Sync the default subaccount once they load asynchronously.
  useEffect(() => {
    if (subcuentas.length > 0 && !subcuentaOrigen) setSubcuentaOrigen(subcuentas[0].id);
  }, [subcuentas, subcuentaOrigen]);

  // Template picked: prefills recipient (left to validate), amount,
  // concept and subaccount. After the effect above so this one wins.
  useEffect(() => {
    if (!template) return;
    setDestQuery(template.destinatario?.cbu ?? "");
    setDestValid(null);
    if (template.monto != null) setMonto(String(template.monto));
    if (template.concepto) setConcepto(template.concepto);
    if (template.subcuentaOrigen) setSubcuentaOrigen(template.subcuentaOrigen);
    onClearTemplate?.();
  }, [template, onClearTemplate]);

  // Editing a scheduled transfer: it loads into this same form (like drafts and
  // frequent recipients). The recipient was already validated, so it is prefilled
  // as valid and the API is not queried again.
  //
  // The ref avoids re-applying the prefill on every render (it would overwrite
  // what the user is typing). It resets when edit mode ends.
  const programadaAplicada = useRef<string | null>(null);
  useEffect(() => {
    if (!programada) {
      programadaAplicada.current = null;
      return;
    }
    if (programadaAplicada.current === programada.id) return;
    programadaAplicada.current = programada.id;

    const p = programada;
    const cbu = p.cbu ?? "";
    setDestQuery(cbu);
    setDestValid(
      cbu
        ? {
            status: "valid",
            ok: true,
            kind: detectIdentifierKind(cbu),
            identifier: cbu,
            provider: "bdc",
            titular: {
              nombre: p.destinatario,
              cuit: p.cuit ?? "",
              cbu,
              alias: p.alias ?? "",
              banco: p.banco,
            },
            validatedAt: new Date().toISOString(),
          }
        : null,
    );
    setMonto(p.montoNum ? String(p.montoNum) : "");
    setFecha(p.fechaISO ?? "");
    if (p.hora) setHora(p.hora);
    if (p.concepto) setConcepto(p.concepto);
    if (p.subcuentaOrigen) setSubcuentaOrigen(p.subcuentaOrigen);
    setConfirm(false);
  }, [programada]);

  const handleValidate = async (
    identifier?: string,
  ): Promise<import("@/lib/recipient-validation").RecipientValidationResult | null> => {
    const q = (identifier ?? destQuery).trim();
    if (!q) {
      toast.error("Ingresa un CBU/CVU o Alias");
      return null;
    }
    setValidating(true);
    try {
      const res = await validateRecipient(q, detectIdentifierKind(q));
      if (res.ok) {
        setDestValid(res);
        return res;
      } else {
        setDestValid(null);
        toast.error(res.errorMessage ?? "Destinatario no válido");
        return null;
      }
    } catch {
      toast.error("Error validando destinatario");
      return null;
    } finally {
      setValidating(false);
    }
  };

  if (confirm && destValid) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Revisa los datos antes de {editando ? "guardar los cambios" : "programar"}. Se validará de
          nuevo al ejecutar.
        </div>
        <div className="border rounded-md divide-y">
          {[
            ["Origen", subcuentas.find((s) => s.id === subcuentaOrigen)?.nombre ?? "—"],
            ["Destinatario", destValid.titular?.nombre ?? destValid.identifier],
            ["Identificador", destValid.identifier + ` (${destValid.kind})`],
            ["Monto", fmt(Number(monto) || 0)],
            ["Fecha", fecha || "—"],
            ["Hora", hora],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2.5 px-3 text-sm">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono tabular-nums font-semibold">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <BtnOutline onClick={() => setConfirm(false)} className="flex-1">
            Volver
          </BtnOutline>
          <BtnPrimary
            disabled={guardando}
            onClick={async () => {
              if (guardando) return;
              setGuardando(true);
              try {
                // Se persiste ANTES de mostrarla en la lista: si falla, no se
                // "guarda" nada y el usuario lo ve en el toast.
                const datos = {
                  destinatario: {
                    nombre: destValid.titular?.nombre ?? destValid.identifier,
                    alias: destValid.titular?.alias,
                    cbu: destValid.titular?.cbu ?? destValid.identifier,
                    cuit: destValid.titular?.cuit,
                    banco: destValid.titular?.banco,
                  },
                  subcuentaOrigen,
                  monto: Number(monto) || 0,
                  concepto,
                  fechaEnvio: fecha || new Date().toISOString().slice(0, 10),
                  horaEnvio: hora,
                };
                // Editing: overwrites the existing scheduled transfer. Otherwise creates a new one.
                const fila = programada
                  ? await updateScheduledTransfer(programada.id, datos)
                  : await createScheduledTransfer(datos);
                await onSuccess(fila);
              } catch (e) {
                toast.error(toDataError(e).message);
              } finally {
                setGuardando(false);
              }
            }}
            className="flex-1"
          >
            {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Programar transferencia"}
          </BtnPrimary>
        </div>
      </div>
    );
  }

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          let valid = destValid;
          if (!valid) {
            valid = await handleValidate();
            if (!valid) return;
          }
          // re-validar si el query cambió después de validar
          if (valid.identifier !== destQuery.trim()) {
            valid = await handleValidate();
            if (!valid) return;
          }
          // asegurar monto válido antes de confirmar
          if (!monto || Number(monto) <= 0) {
            toast.error("Ingresa un monto válido");
            return;
          }
          setConfirm(true);
        }}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Origen de fondos</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={subcuentaOrigen}
              onChange={(e) => setSubcuentaOrigen(e.target.value)}
            >
              {subcuentas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {fmt(Number(s.saldo_disponible))}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Destinatario (CBU/CVU/Alias)</Label>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="22 dígitos o alias (6-20)"
                value={destQuery}
                onChange={(e) => {
                  setDestQuery(e.target.value);
                  setDestValid(null);
                }}
              />
              <BtnOutline type="button" onClick={() => void handleValidate()} disabled={validating}>
                {validating ? "Validando..." : "Validar"}
              </BtnOutline>
            </div>
            {destValid ? (
              <div className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                <ShieldCheck size={11} /> Validado: {destValid.titular?.nombre} —{" "}
                {destValid.titular?.banco ?? destValid.kind}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">
                Se validara contra el banco antes de programar.
              </div>
            )}
            <BtnOutline
              type="button"
              onClick={() => setFrecuentesOpen(true)}
              className="w-full mt-2"
            >
              <Users size={14} /> Destinatarios frecuentes
            </BtnOutline>
          </div>
          <div>
            <Label>Monto</Label>
            <Input placeholder="$ 0,00" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
          <div>
            <Label>Moneda</Label>
            <div className="h-10 px-3 rounded-md border bg-card flex items-center text-sm text-muted-foreground">
              ARS — Pesos Argentinos
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <div>
              <Label>Fecha de envio (hora Argentina)</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Hora de envio (hora Argentina)</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Concepto</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            >
              <option>Pago a proveedor</option>
              <option>Sueldos</option>
              <option>Honorarios</option>
              <option>Servicios</option>
              <option>Devolucion</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Clock size={11} /> Se ejecuta sola a esa fecha y hora (hora Argentina). No hace falta que
          hagas nada.
        </p>
        <div className="flex gap-2 pt-1">
          {editando && (
            <BtnOutline
              type="button"
              className="flex-1"
              onClick={() => {
                onCancelarEdicion?.();
                setConfirm(false);
              }}
            >
              Cancelar
            </BtnOutline>
          )}
          <BtnPrimary type="submit" className="flex-1" disabled={validating}>
            {validating
              ? "Validando..."
              : destValid
                ? editando
                  ? "Revisar y guardar"
                  : "Programar"
                : "Validar y programar"}
          </BtnPrimary>
        </div>
      </form>

      <FormDialog
        open={frecuentesOpen}
        onClose={() => setFrecuentesOpen(false)}
        title="Destinatarios frecuentes"
        description="Selecciona un destinatario de tu lista."
        submitLabel="Cerrar"
        onSubmit={() => setFrecuentesOpen(false)}
        size="md"
      >
        {frecuentes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No tenes destinatarios frecuentes guardados.
          </div>
        ) : (
          <div className="divide-y border rounded-md max-h-64 overflow-y-auto">
            {frecuentes.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  const cbu = f.cbu;
                  setDestQuery(cbu);
                  // Se muestra ya lo guardado y se revalida contra el banco para
                  // traer el detalle completo (banco, tipo de cuenta, estado).
                  setDestValid({
                    status: "valid",
                    ok: true,
                    kind: detectIdentifierKind(cbu),
                    identifier: cbu,
                    provider: "bdc",
                    titular: {
                      nombre: f.nombre,
                      cuit: f.cuit,
                      cbu,
                      alias: f.alias,
                      banco: f.banco,
                    },
                    validatedAt: new Date().toISOString(),
                  });
                  setFrecuentesOpen(false);
                  void handleValidate(cbu);
                }}
                className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{f.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {f.alias ? `@${f.alias} · ` : ""}
                    <span className="font-mono">{f.cbu}</span>
                  </div>
                </div>
                {f.banco && (
                  <span className="text-[11px] text-muted-foreground shrink-0">{f.banco}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </FormDialog>
    </>
  );
}

/* ===== Borradores ===== */
function Borradores({
  drafts,
  onDelete,
  onEdit,
  onExecute,
}: {
  drafts: Draft[];
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onExecute: (id: string) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText size={32} className="mx-auto mb-3 opacity-50" />
        <p className="font-semibold">No tenes borradores</p>
        <p className="text-sm mt-1">Las transferencias que guardes como borrador apareceran aca.</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {drafts.map((d) => (
        <div key={d.id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{d.destinatario}</div>
            <div className="text-xs text-muted-foreground">
              @{d.alias} · <span className="font-mono">{d.monto}</span> · {d.concepto}
            </div>
            <div className="text-[11px] text-muted-foreground/60">Guardado el {d.fecha}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(d.id)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent text-muted-foreground"
              title="Editar"
            >
              <Edit3 size={13} />
            </button>
            <button
              onClick={() => onExecute(d.id)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent text-muted-foreground"
              title="Ejecutar"
            >
              <Play size={13} />
            </button>
            <button
              onClick={() => onDelete(d.id)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-danger-50 text-muted-foreground hover:text-danger-600"
              title="Eliminar"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== Transferencias programadas ===== */
function Programadas({
  items,
  onCancel,
  onEdit,
  onExecute,
}: {
  items: Scheduled[];
  onCancel: (id: string) => void;
  onEdit: (id: string) => void;
  onExecute: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Calendar size={32} className="mx-auto mb-3 opacity-50" />
        <p className="font-semibold">No tenes transferencias programadas</p>
        <p className="text-sm mt-1">Usa la pestana "Programar" para agendar una transferencia.</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {items.map((s) => (
        <div key={s.id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{s.destinatario}</div>
            <div className="text-xs text-muted-foreground">
              @{s.alias} · <span className="font-mono">{s.monto}</span> · {s.concepto}
            </div>
            <div className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
              <Calendar size={11} /> {s.fecha} <Clock size={11} className="ml-1" /> {s.hora}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge tone={STATUS_TONE[s.estado] ?? "neutral"}>{s.estado}</Badge>
            {s.estado === "Programada" && (
              <>
                <button
                  onClick={() => onEdit(s.id)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent text-muted-foreground"
                  title="Editar"
                >
                  <Edit3 size={13} />
                </button>
                <button
                  onClick={() => onExecute(s.id)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent text-muted-foreground"
                  title="Ejecutar ahora"
                >
                  <Play size={13} />
                </button>
                <button
                  onClick={() => onCancel(s.id)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-danger-50 text-muted-foreground hover:text-danger-600"
                  title="Cancelar"
                >
                  <X size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== Destinatarios frecuentes ===== */
function DestinatariosList({
  items,
  onSelect,
  onDelete,
}: {
  items: FrequentRecipient[];
  onSelect: (d: Destinatario) => void;
  onDelete: (id: string) => void | Promise<void>;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users size={32} className="mx-auto mb-3 opacity-50" />
        <p className="font-semibold">No tenes destinatarios frecuentes</p>
        <p className="text-sm mt-1">Los destinatarios se guardan al confirmar una transferencia.</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {items.map((f) => (
        <div key={f.id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{f.nombre}</div>
            <div className="text-xs text-muted-foreground truncate">
              {f.alias ? `@${f.alias} · ` : ""}
              <span className="font-mono">{f.cbu}</span>
              {f.cuit ? ` · CUIT ${f.cuit}` : ""}
            </div>
            {f.banco && <div className="text-[11px] text-muted-foreground/60">{f.banco}</div>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() =>
                onSelect({
                  nombre: f.nombre,
                  cuit: f.cuit,
                  cbu: f.cbu,
                  alias: f.alias,
                  banco: f.banco,
                })
              }
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent text-muted-foreground"
              title="Usar este destinatario"
            >
              <ArrowUpRight size={13} />
            </button>
            <button
              onClick={() => void onDelete(f.id)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-danger-50 text-muted-foreground hover:text-danger-600"
              title="Eliminar"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
