import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  actualizarPuntoVenta,
  crearPuntoVenta,
  eliminarPuntoVenta,
  getDashboardQr,
  listPuntosVenta,
  resolverComercioQr,
  type EstadoPdv,
  type PuntoVenta,
} from "@/lib/api/qr";

// Datos del usuario logueado: sin caché entre montajes y un solo intento (los toasts
// de error se disparan desde la carga, como antes).
const SIN_CACHE = { gcTime: 0, retry: false, refetchOnWindowFocus: false } as const;

type PuntosVentaData = { comercioId: string | null; pdvs: PuntoVenta[] };

const PDV_KEY = ["qr", "puntos-de-venta"] as const;

export function usePuntosVenta() {
  const qc = useQueryClient();
  return useQuery<PuntosVentaData>({
    queryKey: PDV_KEY,
    queryFn: async () => {
      const previos = qc.getQueryData<PuntosVentaData>(PDV_KEY)?.pdvs ?? [];
      try {
        const resultado = await resolverComercioQr();
        if (!resultado.id) {
          if (resultado.error) toast.error(resultado.error);
          return { comercioId: null, pdvs: [] };
        }
        try {
          const pdvs = await listPuntosVenta(resultado.id);
          return { comercioId: resultado.id, pdvs };
        } catch (e) {
          toast.error("No se pudieron cargar los puntos de venta");
          console.error(e);
          return { comercioId: resultado.id, pdvs: previos };
        }
      } catch (e) {
        toast.error("Error al cargar los puntos de venta");
        console.error(e);
        throw e;
      }
    },
    ...SIN_CACHE,
  });
}

export function useGuardarPuntoVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      editingId: string | null;
      comercioId: string;
      nombre: string;
      estado: EstadoPdv;
    }) =>
      v.editingId
        ? actualizarPuntoVenta(v.editingId, { nombre: v.nombre, estado: v.estado })
        : crearPuntoVenta(v.comercioId, v.nombre),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PDV_KEY });
    },
  });
}

export function useEliminarPuntoVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eliminarPuntoVenta(id),
    onSuccess: (_data, id) => {
      qc.setQueryData<PuntosVentaData>(PDV_KEY, (prev) =>
        prev ? { ...prev, pdvs: prev.pdvs.filter((p) => p.id !== id) } : prev,
      );
    },
  });
}

export function useDashboardQr(sinceIso: string) {
  return useQuery({
    queryKey: ["qr", "dashboard", sinceIso],
    queryFn: async () => {
      try {
        const datos = await getDashboardQr(sinceIso);
        if (datos?.cobrosError) {
          toast.error("No se pudieron cargar los cobros QR");
          console.error(datos.cobrosError);
        }
        return datos;
      } catch (e) {
        toast.error("Error al cargar el dashboard de Cobros QR");
        console.error(e);
        throw e;
      }
    },
    ...SIN_CACHE,
  });
}
