import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import {
  confirmarPagoEcartPay,
  crearPagoEcartPay,
  esEstadoAbierto,
  infoEcartPay,
} from "@/lib/api/checkout-ecartpay";

/** ¿El link se cobra con Ecart Pay? (sin reintentos: si falla se usa el checkout propio). */
export function useEcartPayDisponible(code: string) {
  return useQuery({
    queryKey: ["checkout", "ecartpay", "info", code],
    queryFn: () => infoEcartPay(code),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Inicia el pago y redirige a Ecart Pay. La clave de idempotencia se mantiene mientras el
 * intento siga vivo (doble clic = misma orden) y se renueva si el intento falla.
 */
export function useIniciarPagoEcartPay(code: string) {
  const clave = useRef<string>(crypto.randomUUID());
  return useMutation({
    mutationFn: (v: { monto: number; nombre: string; email: string }) =>
      crearPagoEcartPay({ code, idempotencyKey: clave.current, ...v }),
    onSuccess: ({ pago_id, pay_link }) => {
      try {
        sessionStorage.setItem(`jpay-pago-${code}`, pago_id);
      } catch {
        // sin storage: la vuelta trae ?pago= igual
      }
      window.location.assign(pay_link);
    },
    onError: () => {
      clave.current = crypto.randomUUID();
    },
  });
}

/** Estado del pago al volver de Ecart Pay: reconsulta cada 3 s mientras siga abierto (máx. 2 min). */
export function useConfirmarPagoEcartPay(pagoId: string | undefined) {
  const inicio = useRef(Date.now());
  return useQuery({
    queryKey: ["checkout", "ecartpay", "pago", pagoId],
    queryFn: () => confirmarPagoEcartPay(pagoId as string),
    enabled: !!pagoId,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => {
      const estado = q.state.data?.estado;
      if (!estado || !esEstadoAbierto(estado)) return false;
      return Date.now() - inicio.current < 120_000 ? 3000 : false;
    },
  });
}
