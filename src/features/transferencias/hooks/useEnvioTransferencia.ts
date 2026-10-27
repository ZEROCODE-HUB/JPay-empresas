import { useRef, useState } from "react";
import { toast } from "sonner";
import { brand } from "@/brand/brand";
import { toDataError, isPermissionError, extraerMensajeEdgeFunction } from "@/lib/supabase";
import { detectIdentifierKind, type RecipientValidationResult } from "@/lib/recipient-validation";
import { executeTransfer } from "@/lib/transfer-orchestrator";
import { createBdcClient, canTransferBdc, type BdcAccount } from "@/lib/bdc";
import {
  reserveBdcTransfer,
  confirmBdcTransfer,
  cancelBdcTransfer,
  enviarOtpTransferencia,
  verificarOtpTransferencia,
} from "@/lib/api/transferencias";
import type { PasoTransferencia } from "@/components/transfer-ui";
import type { Subcuenta, TransferPayload, TransferSuccess } from "../types";
import { OTP_ENABLED, digitsOnly, mensajeEjecucionFallida } from "../utils";

const OTP_VACIO = ["", "", "", "", "", ""];

/**
 * Envío de una transferencia única: OTP opcional, reserva de fondos, envío al
 * banco (BDC), contabilización y comprobante. El orden de los pasos y los
 * mensajes son parte del contrato: no reordenar.
 */
export function useEnvioTransferencia({
  subcuentas,
  clienteCuit,
  recargar: cargarDatos,
}: {
  subcuentas: Subcuenta[];
  clienteCuit: string;
  recargar: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [destAlias, setDestAlias] = useState("");
  const [saveDestOpen, setSaveDestOpen] = useState(false);
  const [destValidation, setDestValidation] = useState<RecipientValidationResult | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<TransferSuccess | null>(null);
  /** Paso en curso del envio: muestra el overlay que bloquea la pantalla. */
  const [procesando, setProcesando] = useState<{ paso: PasoTransferencia; monto: number } | null>(
    null,
  );
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState(OTP_VACIO);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [transferPayload, setTransferPayload] = useState<TransferPayload | null>(null);

  const resetOtp = () => {
    setOtp(["", "", "", "", "", ""]);
    otpRefs.current[0]?.focus();
  };

  const enviarOtpCorreo = async () => {
    setOtpSending(true);
    try {
      const data = await enviarOtpTransferencia();
      if (data.demo_codigo) {
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

  const reenviarOtp = async () => {
    resetOtp();
    const ok = await enviarOtpCorreo();
    if (ok) toast.success("Nuevo código enviado");
  };

  const cerrarOtp = () => {
    if (!otpVerifying && !otpSending) setOtpOpen(false);
  };

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
      await verificarOtpTransferencia(code);
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
        toast.error(mensajeEjecucionFallida(result.validation.status, result.error));
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

  /** "Confirmar transferencia": pide OTP si está activo; si no, ejecuta directo. */
  const solicitarTransferencia = async (payload: TransferPayload) => {
    // 2FA disabled (OTP_ENABLED = false): the transfer runs straight away.
    // To restore the OTP step set OTP_ENABLED to true in ../utils.ts.
    if (OTP_ENABLED) {
      await openOtp(payload);
      return;
    }
    setConfirm(false);
    await ejecutarTransferencia(payload);
  };

  const cerrarRecibo = () => {
    setSaveDestOpen(false);
    setTransferSuccess(null);
    setDestValidation(null);
  };

  return {
    confirm,
    setConfirm,
    setTransferPayload,
    solicitarTransferencia,
    procesando,
    otp: {
      open: otpOpen,
      digitos: otp,
      setDigitos: setOtp,
      refs: otpRefs,
      sending: otpSending,
      verifying: otpVerifying,
      cerrar: cerrarOtp,
      confirmar: confirmWithOtp,
      reenviar: reenviarOtp,
    },
    recibo: {
      open: saveDestOpen,
      transferSuccess,
      destValidation,
      destAlias,
      cerrar: cerrarRecibo,
    },
  };
}
