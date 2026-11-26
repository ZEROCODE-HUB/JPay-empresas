import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activarPasarelaEcart,
  crearCuentaRetiro,
  desconectarEcartPay,
  enviarCodigoCuentaRetiro,
  getConexionEcartPay,
  getPasarelaEcart,
  getReporteCobros,
  getRetirosEcartPay,
  iniciarConexionEcartPay,
  listCobrosEcartPay,
  prepararCuentaRetiro,
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

export function useReporteCobros(rango: { desde: string; hasta: string }, habilitado = true) {
  return useQuery({
    queryKey: ["integraciones", "reporte", rango.desde, rango.hasta],
    queryFn: () => getReporteCobros(rango.desde, rango.hasta),
    enabled: habilitado,
  });
}

/** CLABE de la cuenta del cliente y si ya está vinculada como cuenta de retiro. */
export function usePreparacionCuentaRetiro(abierto = true) {
  return useQuery({
    queryKey: ["integraciones", "retiros", "preparar"],
    queryFn: prepararCuentaRetiro,
    enabled: abierto,
    staleTime: 60_000,
  });
}

export function useCuentaRetiroMutaciones() {
  const qc = useQueryClient();
  return {
    enviarCodigo: useMutation({ mutationFn: enviarCodigoCuentaRetiro }),
    crear: useMutation({
      mutationFn: crearCuentaRetiro,
      onSuccess: () => qc.invalidateQueries({ queryKey: ["integraciones", "retiros"] }),
    }),
  };
}

export function useRetirosEcartPay(pagina: number, habilitado: boolean) {
  return useQuery({
    queryKey: ["integraciones", "retiros", pagina],
    queryFn: () => getRetirosEcartPay(pagina),
    enabled: habilitado,
    placeholderData: (prev) => prev,
  });
}

/** Estado de la pasarela de Ecart Pay del comercio (solo si la conexión está activa). */
export function usePasarelaEcart(comercioId: string | null, conectado: boolean) {
  return useQuery({
    queryKey: [...KEY, "pasarela", comercioId],
    queryFn: () => getPasarelaEcart(comercioId as string),
    enabled: !!comercioId && conectado,
    staleTime: 60_000,
  });
}

export function useActivarPasarelaEcart(comercioId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => activarPasarelaEcart(comercioId as string),
    onSuccess: (p) => qc.setQueryData([...KEY, "pasarela", comercioId], p),
  });
}
