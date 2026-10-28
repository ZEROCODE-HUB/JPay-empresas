/**
 * Módulos del país activo leídos de la base (`paises.modulos`), para armar menús.
 * Mientras carga, o si falla, se usan los de `pais.ts`.
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { conModulos, getPais, type ConfigPais } from "./pais";

export function usePaisConModulos(): ConfigPais {
  const codigo = getPais().codigo;
  const { data } = useQuery({
    queryKey: ["paises", "modulos", codigo],
    queryFn: async () => {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("paises")
        .select("modulos")
        .eq("codigo", codigo)
        .maybeSingle();
      if (error) throw error;
      return data?.modulos ?? null;
    },
    staleTime: 5 * 60_000,
  });
  return useMemo(() => conModulos(getPais(), data), [data]);
}
