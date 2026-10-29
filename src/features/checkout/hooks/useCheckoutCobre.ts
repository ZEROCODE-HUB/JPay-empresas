import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { crearPagoCobre, estadoPagoCobre, infoCobre } from "@/lib/api/checkout-cobre";

/** ¿El link se puede pagar por SPEI con Cobre? (sin reintentos: si falla, no se ofrece). */
export function useCobreDisponible(code: string) {
  return useQuery({
    queryKey: ["checkout", "cobre", "info", code],
    queryFn: () => infoCobre(code),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Genera la CLABE de pago. Mismo intento (doble clic) = mismo cobro; si falla, clave nueva. */
export function useIniciarPagoCobre(code: string) {
  const clave = useRef<string>(crypto.randomUUID());
  return useMutation({
    mutationFn: (v: { monto: number; nombre: string; idNumero: string; email: string }) =>
      crearPagoCobre({ code, idempotencyKey: clave.current, ...v }),
    onError: () => {
      clave.current = crypto.randomUUID();
    },
  });
}

/** Estado del pago cada 10 s mientras siga pendiente (el pago llega cuando el cliente transfiere). */
export function useEstadoPagoCobre(pagoId: string | undefined) {
  return useQuery({
    queryKey: ["checkout", "cobre", "pago", pagoId],
    queryFn: () => estadoPagoCobre(pagoId as string),
    enabled: !!pagoId,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: (q) =>
      q.state.data && ["creado", "pendiente"].includes(q.state.data.estado) ? 10_000 : false,
  });
}
