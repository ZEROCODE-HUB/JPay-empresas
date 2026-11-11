import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { FiltrosHistorial } from "@/lib/api/movimientos";
import { useHistorial } from "@/hooks/useMovimientos";
import {
  aLinea,
  clabeUnica,
  estadoVista,
  subFiltroDeVista,
  totalesDesdeBase,
  type ClienteComprobante,
  type Linea,
  type ModoVista,
} from "../utils";

/** Datos del historial ya mapeados: cliente, subcuentas, líneas de la página y totales. */
export function useMovimientosHistorial(filtros: FiltrosHistorial) {
  const historial = useHistorial(filtros);
  const cli = historial.data?.cliente;
  const subcuentas = historial.data?.subcuentas ?? [];
  const sinSubcuentas = !!historial.data && (!cli?.legajo || subcuentas.length === 0);
  const cliente: ClienteComprobante = {
    nombre: String(cli?.nombre ?? ""),
    rfc: String(cli?.tax_id ?? ""),
    clabe: clabeUnica(subcuentas),
  };
  const lineas: Linea[] = historial.isError ? [] : (historial.data?.lineas ?? []).map(aLinea);
  const totalCount = historial.isError ? 0 : (historial.data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / filtros.pageSize));

  // Si ya había datos y falla un refresco, se avisa con un toast; si no hay nada que mostrar, la
  // pantalla muestra «No se pudo cargar» en su lugar.
  const errorSinDatos = historial.isError && !historial.data;
  useEffect(() => {
    if (historial.isError && historial.data) toast.error("No se pudieron cargar los movimientos");
  }, [historial.isError, historial.errorUpdatedAt, historial.data]);

  return {
    loading: historial.loading,
    cargando: historial.cargando && !historial.isError,
    error: errorSinDatos ? historial.error : null,
    reintentar: historial.refetch,
    cliente,
    subcuentas,
    sinSubcuentas,
    lineas,
    totalCount,
    totalPages,
    totales: totalesDesdeBase(
      historial.isError ? null : historial.data?.totales,
      subcuentas.find((s) => s.nombre === filtros.subcuenta)?.moneda ?? "MXN",
    ),
  };
}

/**
 * Selector "Cuenta principal / Por subcuenta". No tiene filtro propio: maneja
 * el mismo filtro de subcuenta que la tarjeta de filtros, así que cambiar la
 * vista filtra los movimientos y los dos selectores quedan sincronizados.
 */
export function useVistaHistorial(
  subFiltro: string,
  setSubFiltro: (nombre: string) => void,
  primeraSubcuenta: string | undefined,
) {
  const [modoSub, setModoSub] = useState(subFiltro !== "Todas");
  const { vista, sub } = estadoVista(subFiltro, modoSub, primeraSubcuenta);

  const setVista = (v: ModoVista) => {
    setModoSub(v === "sub");
    setSubFiltro(subFiltroDeVista(v, primeraSubcuenta));
  };
  const setSub = (nombre: string) => setSubFiltro(nombre);

  return { vista, setVista, sub, setSub };
}

export type VistaHistorial = ReturnType<typeof useVistaHistorial>;
