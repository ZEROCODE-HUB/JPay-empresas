import { useQuery } from "@tanstack/react-query";
import { getEmailUsuarioActual } from "@/lib/api/auth";
import {
  getClienteDatosEmpresa,
  getClienteDatosPersonales,
  getEstadoOnboarding,
  getPrefillKyc,
} from "@/lib/api/onboarding";

// Datos del usuario logueado: sin caché entre montajes (no dependen de una key de usuario)
// y un solo intento, como la carga anterior.
const SIN_CACHE = { gcTime: 0, retry: false, refetchOnWindowFocus: false } as const;

export function useEstadoOnboarding() {
  return useQuery({
    queryKey: ["onboarding", "estado"],
    queryFn: getEstadoOnboarding,
    ...SIN_CACHE,
  });
}

export function usePrefillKyc() {
  return useQuery({
    queryKey: ["onboarding", "prefill-kyc"],
    queryFn: getPrefillKyc,
    ...SIN_CACHE,
  });
}

/** Correo del usuario + datos personales guardados (null si no hay sesión). */
export function useDatosPersonalesGuardados() {
  return useQuery({
    queryKey: ["onboarding", "datos-personales"],
    queryFn: async () => {
      const email = await getEmailUsuarioActual();
      if (!email) return null;
      const cliente = await getClienteDatosPersonales(email).catch(() => null);
      return { email, cliente };
    },
    ...SIN_CACHE,
  });
}

export function useDatosEmpresaGuardados() {
  return useQuery({
    queryKey: ["onboarding", "datos-empresa"],
    queryFn: async () => {
      const email = await getEmailUsuarioActual();
      if (!email) return null;
      return getClienteDatosEmpresa(email);
    },
    ...SIN_CACHE,
  });
}
