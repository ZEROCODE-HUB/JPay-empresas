import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { FiltrosHistorial } from "@/lib/api/movimientos";
import { useHistorial } from "@/hooks/useMovimientos";
import { aLinea, cbuUnico, totalesPagina, type ClienteComprobante, type Linea } from "../utils";

/** Datos del historial ya mapeados: cliente, subcuentas, líneas de la página y totales. */
export function useMovimientosHistorial(filtros: FiltrosHistorial) {
  const historial = useHistorial(filtros);
  const cli = historial.data?.cliente;
  const subcuentas = historial.data?.subcuentas ?? [];
  const sinSubcuentas = !!historial.data && (!cli?.legajo || subcuentas.length === 0);
  const cliente: ClienteComprobante = {
    nombre: String(cli?.nombre ?? ""),
    cuit: String(cli?.cuit ?? "") || String(cli?.cuit_cuil ?? ""),
    cbu: cbuUnico(subcuentas),
  };
  const lineas: Linea[] = historial.isError ? [] : (historial.data?.lineas ?? []).map(aLinea);
  const totalCount = historial.isError ? 0 : (historial.data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / filtros.pageSize));

  useEffect(() => {
    if (historial.isError) toast.error("No se pudieron cargar los movimientos");
  }, [historial.isError, historial.errorUpdatedAt]);

  return {
    loading: historial.loading,
    cliente,
    subcuentas,
    sinSubcuentas,
    lineas,
    totalCount,
    totalPages,
    totales: totalesPagina(lineas),
  };
}

/** Selector "Cuenta principal / Por subcuenta" (solo cambia el texto mostrado). */
export function useVistaHistorial(primeraSubcuenta: string | undefined) {
  const [vista, setVista] = useState<"principal" | "sub">("principal");
  const [sub, setSub] = useState("");

  useEffect(() => {
    if (primeraSubcuenta && !sub) setSub(primeraSubcuenta);
  }, [primeraSubcuenta, sub]);

  return { vista, setVista, sub, setSub };
}

export type VistaHistorial = ReturnType<typeof useVistaHistorial>;
