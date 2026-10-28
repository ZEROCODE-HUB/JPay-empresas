import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  desconectarEcartPay,
  getConexionEcartPay,
  iniciarConexionEcartPay,
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
