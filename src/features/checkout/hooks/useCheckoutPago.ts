import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { brand } from "@/brand/brand";
import type { CheckoutBandera, CheckoutLink } from "@/lib/api/checkout";
import { useCheckoutLink } from "@/hooks/useCheckout";
import { paymentProcessor } from "@/lib/payment-processor";
import { isDevWithTestCard, PAYWAY_TEST_CARD, testCardFitsMethod } from "@/lib/payway-test-card";
import {
  banderaIdDelMethod,
  cvvMax,
  formatNro,
  formatVenc,
  isCardMethod,
  metodoInicial,
  metodosDisponibles as calcularMetodos,
  normalizarBandera,
  parseMonto,
  totalLink,
  validarPago,
  validarSimulacion,
} from "../utils";

export type CheckoutStatus =
  "loading" | "ready" | "notfound" | "inactive" | "expired" | "success" | "error";

/**
 * Datos del comprobante que ve el pagador al terminar.
 *
 * `pagoEn` es la hora del navegador, no la del servidor: el backend no
 * devuelve el `created_at` que escribio en `cliente_links_pago_pagos`. Se
 * muestra en hora local de quien pago, que es como se lee un comprobante,
 * pero si hace falta la hora exacta del servidor hay que exponerla en la
 * respuesta de `/api/payway`.
 */
export type ResultadoPago = {
  id: string;
  monto: number;
  ref: string;
  paywayPaymentId?: string;
  cuotas?: number;
  metodo?: string;
  pagoEn: Date;
  /** true cuando el cobro fue simulado (no se llamo a la pasarela). */
  simulado?: boolean;
};

/** Estado y acciones del checkout público (`/p/$code`). */
export function useCheckoutPago(code: string) {
  const linkQuery = useCheckoutLink(code);
  const resultado = linkQuery.data;
  const [pagado, setPagado] = useState(false);
  const status: CheckoutStatus = pagado
    ? "success"
    : linkQuery.isError
      ? "error"
      : !resultado
        ? "loading"
        : resultado.estado;
  const data: CheckoutLink | null =
    resultado && resultado.estado !== "notfound" ? resultado.link : null;
  const [method, setMethod] = useState<string>("");
  const [montoPagar, setMontoPagar] = useState<string>("");
  const [titular, setTitular] = useState("");
  const [nro, setNro] = useState("");
  const [venc, setVenc] = useState("");
  const [cvv, setCvv] = useState("");
  const [email, setEmail] = useState("");
  const [documento, setDocumento] = useState("");
  const cardFormRef = useRef<HTMLFormElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ResultadoPago | null>(null);
  /**
   * Filas de `comercio_banderas` con su UUID. El backend resuelve el metodo
   * a partir del id de bandera, no del texto visible, asi que hace falta
   * poder mapear "visa-cred" -> fila concreta del comercio del link.
   */
  const banderasRows = useMemo<CheckoutBandera[]>(
    () => (resultado?.estado === "ready" ? (resultado.banderas ?? []) : []),
    [resultado],
  );
  const comercioBanderas = useMemo(
    () => banderasRows.map((b) => normalizarBandera(b.bandera)),
    [banderasRows],
  );

  // Al resolver el link se preselecciona el primer metodo y el monto total.
  useEffect(() => {
    if (resultado?.estado !== "ready") return;
    const d = resultado.link;
    setMethod(metodoInicial(comercioBanderas, d.metodos_pago));
    setMontoPagar(totalLink(d).toFixed(2));
    // Solo al llegar un resultado nuevo de la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado]);

  const metodosDisponibles = useMemo(
    () => calcularMetodos(comercioBanderas, data?.metodos_pago),
    [data, comercioBanderas],
  );

  /**
   * Prellena los datos de prueba de Payway, solo en desarrollo.
   *
   * Es una comodidad para no tipear 16 digitos en cada iteracion. El gate esta
   * en `isDevWithTestCard()`, que exige build de desarrollo mas el flag
   * explicito: en produccion esto no corre.
   *
   * Los campos se llenan para cualquier metodo de tarjeta cuyo PAN sea de 16
   * digitos. Amex (15) y Diners (14) se saltan a proposito: recortada, la
   * tarjeta daria un numero invalido en vez de un error que explique el motivo.
   */
  useEffect(() => {
    if (!isDevWithTestCard() || status !== "ready") return;
    if (!isCardMethod(method) || !testCardFitsMethod(method)) return;
    setTitular(PAYWAY_TEST_CARD.holderName);
    setNro(formatNro(PAYWAY_TEST_CARD.number, method));
    setVenc(formatVenc(PAYWAY_TEST_CARD.expiration));
    setCvv(PAYWAY_TEST_CARD.securityCode);
    setDocumento(PAYWAY_TEST_CARD.docNumber);
    setEmail(`test@${brand.web.domain}`);
  }, [status, method]);

  const chooseMethod = (id: string) => {
    setMethod(id);
    setNro((prev) => formatNro(prev, id));
    setCvv((prev) => prev.slice(0, cvvMax(id)));
  };

  const totalData = data ? totalLink(data) : null;
  const labelMetodo = () => metodosDisponibles.find((m) => m.id === method)?.label ?? method;

  const pagar = async () => {
    const err = validarPago({
      method,
      titular,
      nro,
      venc,
      cvv,
      documento,
      email,
      montoPagar,
      total: totalData,
    });
    if (err) {
      toast.error(err);
      return;
    }
    if (!data) return;
    setProcessing(true);
    try {
      const mp = parseMonto(montoPagar);

      // Se envia el codigo del link, no su id ni su monto. El backend resuelve
      // el link y calcula cuanto corresponde cobrar: el `mp` de arriba es un dato
      // de UI para links con pagos parciales, no una autoridad.
      const res = await paymentProcessor.process({
        linkCode: code,
        metodo: method,
        banderaId: banderaIdDelMethod(banderasRows, method),
        monto: mp,
        pagadorNombre: titular.trim(),
        pagadorEmail: email.trim(),
        card: isCardMethod(method)
          ? { number: nro, holderName: titular.trim(), expiration: venc, securityCode: cvv }
          : undefined,
        // El SDK de Payway lee la tarjeta del DOM, no de este objeto: necesita
        // el `<form>` con los atributos `data-decidir`.
        cardForm: isCardMethod(method) ? cardFormRef.current : null,
        ...(documento.trim()
          ? { documento: { type: "dni" as const, number: documento.trim() } }
          : {}),
      });

      // El monto que se muestra es el que confirmo el backend, no el que se
      // pidio desde el formulario.
      setResult({
        id: res.id,
        monto: res.monto ?? mp,
        ref: data.referencia ?? res.id,
        paywayPaymentId: res.paywayPaymentId,
        // El checkout no ofrece selector de cuotas, asi que el pedido sale sin
        // `cuotas` y el backend aplica su default (1). Solo tiene sentido
        // mostrarlo para metodos que se pagan en cuotas.
        cuotas: isCardMethod(method) ? 1 : undefined,
        metodo: labelMetodo(),
        pagoEn: new Date(),
      });
      setPagado(true);
    } catch (e) {
      const err = e as { name?: string; message?: string } | null;
      // Los datos de la tarjeta no se conservan: si el usuario reintenta, vuelve
      // a tipearlos. Es una decision de PCI, no de conveniencia.
      if (isCardMethod(method)) {
        setNro("");
        setCvv("");
        setVenc("");
      }
      if (err?.name === "PaymentPendingError") {
        toast.info(err.message);
        return;
      }
      toast.error(err?.message || "No se pudo procesar el pago");
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Simulacion de pago: mismo camino que `pagar` menos la validacion de los
   * campos de tarjeta (no se tokeniza nada) y menos la llamada a la pasarela.
   * El backend registra el cobro via RPC como aprobado, asi que el movimiento
   * y los lotes quedan en la base igual que con un cobro real.
   */
  const simular = async () => {
    const err = validarSimulacion({ method, email, montoPagar, total: totalData });
    if (err) {
      toast.error(err);
      return;
    }
    if (!data) return;
    const mp = parseMonto(montoPagar);
    setProcessing(true);
    try {
      const res = await paymentProcessor.simulate({
        linkCode: code,
        metodo: method,
        banderaId: banderaIdDelMethod(banderasRows, method),
        monto: mp,
        pagadorNombre: titular.trim() || "Pago simulado",
        pagadorEmail: email.trim(),
        ...(documento.trim()
          ? { documento: { type: "dni" as const, number: documento.trim() } }
          : {}),
      });

      setResult({
        id: res.id,
        monto: res.monto ?? mp,
        ref: data.referencia ?? res.id,
        paywayPaymentId: res.paywayPaymentId,
        cuotas: isCardMethod(method) ? 1 : undefined,
        metodo: labelMetodo(),
        pagoEn: new Date(),
        simulado: true,
      });
      setPagado(true);
    } catch (e) {
      toast.error((e as { message?: string } | null)?.message || "No se pudo simular el pago");
    } finally {
      setProcessing(false);
    }
  };

  return {
    status,
    data,
    result,
    metodosDisponibles,
    method,
    chooseMethod,
    montoPagar,
    setMontoPagar,
    total: totalData ?? 0,
    tarjeta: {
      titular,
      setTitular,
      nro,
      setNro,
      venc,
      setVenc,
      cvv,
      setCvv,
      documento,
      setDocumento,
    },
    email,
    setEmail,
    cardFormRef,
    processing,
    pagar,
    simular,
  };
}

export type CheckoutPago = ReturnType<typeof useCheckoutPago>;
