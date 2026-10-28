import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accionPos,
  listPuntosFisicos,
  type CajaInput,
  type SucursalInput,
} from "@/lib/api/puntos-fisicos";

const KEY = ["puntos-fisicos"] as const;

export function usePuntosFisicos(comercioId: string | null) {
  return useQuery({
    queryKey: [...KEY, comercioId],
    queryFn: () => listPuntosFisicos(comercioId as string),
    enabled: !!comercioId,
  });
}

/** Acciones de puntos físicos; todas refrescan el listado al terminar. */
export function usePuntosFisicosMutaciones(comercioId: string | null) {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: KEY });
  const id = () => {
    if (!comercioId) throw new Error("No hay comercio seleccionado");
    return comercioId;
  };
  return {
    sincronizar: useMutation({
      mutationFn: () =>
        accionPos<{ sucursales: number; cajas: number; terminales: number }>(id(), "sincronizar"),
      onSuccess,
    }),
    guardarSucursal: useMutation({
      mutationFn: (s: SucursalInput) => accionPos(id(), "guardar_sucursal", s),
      onSuccess,
    }),
    borrarSucursal: useMutation({
      mutationFn: (sucursalId: string) => accionPos(id(), "borrar_sucursal", { id: sucursalId }),
      onSuccess,
    }),
    guardarCaja: useMutation({
      mutationFn: (c: CajaInput) => accionPos(id(), "guardar_caja", c),
      onSuccess,
    }),
    borrarCaja: useMutation({
      mutationFn: (cajaId: string) => accionPos(id(), "borrar_caja", { id: cajaId }),
      onSuccess,
    }),
    vincular: useMutation({
      mutationFn: (v: { cajaId: string; terminalId: string | null }) =>
        v.terminalId
          ? accionPos(id(), "vincular_terminal", { caja_id: v.cajaId, terminal_id: v.terminalId })
          : accionPos(id(), "desvincular_terminal", { caja_id: v.cajaId }),
      onSuccess,
    }),
    modoTerminal: useMutation({
      mutationFn: (v: { terminalId: string; puntoVenta: boolean }) =>
        accionPos(id(), "modo_terminal", { terminal_id: v.terminalId, punto_venta: v.puntoVenta }),
      onSuccess,
    }),
  };
}
