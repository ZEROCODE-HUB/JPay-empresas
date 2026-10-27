import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelarAdelanto,
  getComercioLiquidaciones,
  getLiquidacionesDatos,
  ingresarAdelanto,
  LIQUIDACIONES_VACIAS,
  type LiquidacionesDatos,
} from "@/lib/api/liquidaciones";
import {
  getAdelantosPorDia,
  getMinMontoAdelanto,
  listCalendarioAcreditaciones,
  type AdelantoParaCalendario,
  type CalendarioAcreditacion,
} from "@/lib/api/calendario-acreditaciones";

// La pantalla carga una vez al montar y después actualiza en memoria tras
// crear o cancelar un adelanto; no se refresca sola.
const SIN_REFETCH_AUTO = { refetchOnWindowFocus: false, retry: false } as const;

export function useLiquidaciones() {
  const queryClient = useQueryClient();
  const comercio = useQuery({
    queryKey: ["liquidaciones", "comercio"],
    queryFn: getComercioLiquidaciones,
    ...SIN_REFETCH_AUTO,
  });
  const comercioId = comercio.data?.comercioId ?? null;
  const cuit = comercio.data?.cuit ?? null;
  const datosKey = ["liquidaciones", "datos", comercioId, cuit];
  const datos = useQuery({
    queryKey: datosKey,
    queryFn: () => getLiquidacionesDatos({ comercioId, cuit }),
    enabled: comercio.isSuccess,
    ...SIN_REFETCH_AUTO,
  });

  /** Actualiza los datos en memoria (sin volver a consultar). */
  const actualizarDatos = (fn: (d: LiquidacionesDatos) => LiquidacionesDatos) => {
    queryClient.setQueryData<LiquidacionesDatos>(datosKey, (prev) =>
      fn(prev ?? LIQUIDACIONES_VACIAS),
    );
  };

  return {
    comercioId,
    datos: datos.data ?? LIQUIDACIONES_VACIAS,
    isLoading: comercio.isLoading || datos.isLoading,
    actualizarDatos,
  };
}

export function useIngresarAdelanto() {
  return useMutation({ mutationFn: ingresarAdelanto });
}

export function useCancelarAdelanto() {
  return useMutation({ mutationFn: cancelarAdelanto });
}

export function useMinMontoAdelanto() {
  const { data } = useQuery({
    queryKey: ["liquidaciones", "min-monto-adelanto"],
    queryFn: getMinMontoAdelanto,
    ...SIN_REFETCH_AUTO,
  });
  return data ?? 100;
}

export function useCalendarioAcreditaciones(comercioId: string | null, mes: number, anio: number) {
  return useQuery<CalendarioAcreditacion[]>({
    queryKey: ["calendario", comercioId, mes, anio],
    queryFn: () => {
      if (!comercioId) return Promise.resolve([]);
      return listCalendarioAcreditaciones({ mes, anio, comercioId });
    },
    enabled: !!comercioId,
    staleTime: 60_000,
  });
}

export function useAdelantosPorDia(comercioId: string | null, fecha: string | null) {
  return useQuery<AdelantoParaCalendario[]>({
    queryKey: ["calendario-adelantos-dia", comercioId, fecha],
    queryFn: () => {
      if (!comercioId || !fecha) return Promise.resolve([]);
      return getAdelantosPorDia(comercioId, fecha);
    },
    enabled: !!comercioId && !!fecha,
  });
}
