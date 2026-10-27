import { useQuery } from "@tanstack/react-query";
import { getUsuarioActual, listarFactoresMfa } from "@/lib/api/auth";

export const KEY_FACTORES_MFA = ["auth", "mfa", "factores"] as const;

/** Factores MFA del usuario (para saber si el 2FA está activo). */
export function useFactoresMfa() {
  const query = useQuery({ queryKey: KEY_FACTORES_MFA, queryFn: listarFactoresMfa });
  return { factores: query.data ?? [], loading: query.isLoading, error: query.isError };
}

/** Usuario autenticado de la sesión actual. */
export function useUsuarioActual() {
  const query = useQuery({ queryKey: ["auth", "usuario"], queryFn: getUsuarioActual });
  return { usuario: query.data ?? null, loading: query.isLoading };
}
