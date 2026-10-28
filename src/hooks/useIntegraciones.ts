import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  desconectarEcartPay,
  getConexionEcartPay,
  iniciarConexionEcartPay,
  listCobrosEcartPay,
  reembolsarCobro,
} from "@/lib/api/integraciones";

const KEY = ["integraciones", "ecartpay"] as const;

export function useConexionEcartPay(comercioId: string | null) {
  return useQuery({
    queryKey: [...KEY, comercioId],
    queryFn: () => getConexionEcartPay(comercioId as string),
    enabled: !!comercioId,
  });
}

export function useConexionEcartPayMutaciones() {
  const qc = useQueryClient();
  return {
    /** Redirige el navegador a Ecart Pay; vuelve a /app/integraciones con el resultado. */
    conectar: useMutation({
      mutationFn: iniciarConexionEcartPay,
      onSuccess: (url) => window.location.assign(url),
    }),
    desconectar: useMutation({
      mutationFn: desconectarEcartPay,
      onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    }),
  };
}

export function useCobrosEcartPay(habilitado: boolean) {
  return useQuery({
    queryKey: ["integraciones", "cobros"],
    queryFn: () => listCobrosEcartPay(),
    enabled: habilitado,
    refetchInterval: 30_000,
  });
}

export function useReembolsarCobro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reembolsarCobro,
    onSettled: () => qc.invalidateQueries({ queryKey: ["integraciones", "cobros"] }),
  });
}
