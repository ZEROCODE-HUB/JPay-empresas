import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mensajeError } from "@/shared/errores";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: {
      /** La pantalla ya muestra su propio error: no sale el aviso general. */
      silencioso?: boolean;
    };
  }
}

/**
 * QueryClient de la app. Si una consulta falla la primera vez (no hay datos que mostrar) sale un
 * aviso general, uno solo aunque fallen varias a la vez. Cada pantalla además muestra su error
 * en el lugar (ErrorCarga); `meta: { silencioso: true }` apaga el aviso general para esa consulta.
 * Si falla un refresco y ya había datos, se siguen mostrando los anteriores sin avisar.
 */
export function crearQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (typeof window === "undefined") return;
        if (query.meta?.silencioso || query.state.data !== undefined) return;
        toast.error("No pudimos cargar parte de la información", {
          id: "error-consulta",
          description: mensajeError(error) || "Inténtalo de nuevo en unos segundos.",
        });
      },
    }),
  });
}
