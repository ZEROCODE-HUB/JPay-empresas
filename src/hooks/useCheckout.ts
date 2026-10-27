import { useQuery } from "@tanstack/react-query";
import { getCheckoutLink } from "@/lib/api/checkout";

/**
 * Link público del checkout. La consulta suma una vista al link, así que no
 * se reintenta ni se refresca sola; sin caché, cada montaje vuelve a leerlo.
 */
export function useCheckoutLink(code: string) {
  return useQuery({
    queryKey: ["checkout", code],
    queryFn: () => getCheckoutLink(code),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
