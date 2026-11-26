import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUltimaSolicitud,
  solicitarContacto,
  type ServicioContacto,
} from "@/lib/api/solicitudes";

const KEY = ["solicitudes"] as const;

/** Última solicitud del cliente para un servicio (y un comercio, si aplica). */
export function useUltimaSolicitud(servicio: ServicioContacto, comercioId?: string | null) {
  return useQuery({
    queryKey: [...KEY, servicio, comercioId ?? null],
    queryFn: () => getUltimaSolicitud(servicio, comercioId),
  });
}

/** Envía la solicitud y refresca las consultas de solicitudes. */
export function useSolicitarContacto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: solicitarContacto,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
