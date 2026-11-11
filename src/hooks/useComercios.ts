import { useQuery } from "@tanstack/react-query";
import { listComerciosCliente } from "@/lib/api/comercios";

export function useComerciosCliente() {
  const query = useQuery({ queryKey: ["comercios", "cliente"], queryFn: listComerciosCliente });
  return {
    rows: query.data ?? null,
    isLoading: query.isLoading,
    error: query.data === undefined && query.isError ? query.error : null,
    refetch: () => void query.refetch(),
  };
}
