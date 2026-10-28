import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import {
  confirmarPagoEcartPay,
  crearPagoEcartPay,
  esEstadoAbierto,
  infoEcartPay,
  type MetodoCheckout,
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
 * Inicia el pago. Con tarjeta redirige a Ecart Pay; con SPEI u OXXO muestra la referencia en
 * /p/$code?pago=<id>. La clave de idempotencia se mantiene mientras el intento siga vivo
 * (doble clic = misma orden) y se renueva si el intento falla.
 */
export function useIniciarPagoEcartPay(code: string) {
  const clave = useRef<string>(crypto.randomUUID());
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (v: { metodo: MetodoCheckout; monto: number; nombre: string; email: string }) =>
      crearPagoEcartPay({ code, idempotencyKey: clave.current, ...v }),
    onSuccess: (r) => {
      if ("pay_link" in r) {
        window.location.assign(r.pay_link);
      } else {
        void navigate({ to: "/p/$code", params: { code }, search: { pago: r.pago_id } });
      }
    },
    onError: () => {
      clave.current = crypto.randomUUID();
    },
  });
}

/**
 * Estado del pago: reconsulta cada 3 s mientras siga abierto (máx. 2 min); con referencia (SPEI,
 * OXXO) cada 15 s, porque el pago llega cuando el cliente transfiere o paga en tienda.
 */
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
      if (q.state.data?.referencia) return 15_000;
      return Date.now() - inicio.current < 120_000 ? 3000 : false;
    },
  });
}
