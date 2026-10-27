import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getExportDia } from "@/lib/api/calendario-acreditaciones";
import { useAdelantosPorDia, useCalendarioAcreditaciones } from "@/hooks/useLiquidaciones";
import { exportarDiaExcel, exportarDiaPdf } from "../export";
import {
  agruparPorFecha,
  diasDeLaGrilla,
  fmtDateLarga,
  mesAnterior,
  mesSiguiente,
  type MesAnio,
} from "../utils";

const mesActual = (): MesAnio => {
  const t = new Date();
  return { mes: t.getMonth() + 1, anio: t.getFullYear() };
};

/** Estado del tab Calendario: mes visible, día abierto y exportación del día. */
export function useCalendarioMes(comercioId: string | null) {
  const [{ mes, anio }, setMesAnio] = useState<MesAnio>(mesActual);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const { data: items = [], isLoading } = useCalendarioAcreditaciones(comercioId, mes, anio);
  const { data: adelantosDelDia = [] } = useAdelantosPorDia(comercioId, selectedDate);

  const itemsPorFecha = useMemo(() => agruparPorFecha(items), [items]);
  const diasDelMes = useMemo(() => diasDeLaGrilla(mes, anio), [mes, anio]);
  const itemsDelDia = selectedDate ? (itemsPorFecha.get(selectedDate) ?? []) : [];

  const exportarDia = async (formato: "xlsx" | "pdf") => {
    if (!selectedDate || !comercioId) return;
    setExporting(formato);
    try {
      const rows = await getExportDia(selectedDate, comercioId);
      if (rows.length === 0) {
        toast.error("No hay filas para exportar");
        return;
      }
      const titulo = fmtDateLarga(selectedDate);
      if (formato === "xlsx") exportarDiaExcel(titulo, rows);
      else exportarDiaPdf(titulo, rows);
      toast.success(`Exportación ${formato.toUpperCase()} lista`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  return {
    mes,
    anio,
    irMesAnterior: () => setMesAnio(mesAnterior({ mes, anio })),
    irMesSiguiente: () => setMesAnio(mesSiguiente({ mes, anio })),
    irHoy: () => setMesAnio(mesActual()),
    isLoading,
    itemsPorFecha,
    diasDelMes,
    selectedDate,
    setSelectedDate,
    itemsDelDia,
    adelantosDelDia,
    exporting,
    exportarDia,
  };
}
