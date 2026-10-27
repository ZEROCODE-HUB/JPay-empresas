import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Suscripción realtime de Supabase: ante cualquier cambio (insert/update/delete) en cada
 * tabla de `tablas`, invalida las queries indicadas para que se vuelvan a pedir.
 *
 *   useRealtimeInvalidate("realtime-contracargos", { contracargos: [["contracargos"], ["lotes"]] });
 */
export function useRealtimeInvalidate(canal: string, tablas: Record<string, QueryKey[]>) {
  const qc = useQueryClient();
  // Clave estable: el objeto `tablas` suele crearse en cada render.
  const clave = JSON.stringify(tablas);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    const mapa = JSON.parse(clave) as Record<string, QueryKey[]>;
    const ch = sb.channel(canal);
    for (const [table, keys] of Object.entries(mapa)) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const queryKey of keys) qc.invalidateQueries({ queryKey });
      });
    }
    ch.subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [canal, clave, qc]);
}
