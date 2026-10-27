import { useMemo, useState } from "react";
import type { LiquidacionesDatos } from "@/lib/api/liquidaciones";
import { ordenarAcreditados } from "../utils";
import { usePaginacion } from "./usePaginacion";

export type TabSeccion = "calendario" | "tickets" | "lotes-venta" | "comisiones" | "acreditaciones";

/**
 * Tab activo y paginación de cada listado. Vive en la pantalla (no en cada
 * tab) para que la página elegida se conserve al cambiar de tab.
 */
export function useTabsLiquidaciones(datos: LiquidacionesDatos) {
  const [activeTab, setActiveTab] = useState<TabSeccion>("calendario");
  const acreditados = useMemo(
    () => ordenarAcreditados(datos.lotesAcreditados),
    [datos.lotesAcreditados],
  );
  return {
    activeTab,
    setActiveTab,
    tickets: usePaginacion(datos.tickets),
    lotesVenta: usePaginacion(datos.lotesVenta),
    acreditados: usePaginacion(acreditados),
  };
}
