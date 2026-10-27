import { useMemo, useState } from "react";
import { useDashboardQr } from "@/hooks/useQr";
import { calcularDashboardQr, desdePreset, PRESETS } from "../utils";

/** Período elegido y datos calculados del dashboard de cobros QR. */
export function usePeriodoQr() {
  const [presetLabel, setPresetLabel] = useState(PRESETS[2].label);
  const sinceIso = useMemo(() => desdePreset(presetLabel), [presetLabel]);
  const { data: datos, isLoading: loading } = useDashboardQr(sinceIso);
  const calculado = useMemo(() => calcularDashboardQr(datos), [datos]);
  return { presetLabel, setPresetLabel, loading, ...calculado };
}
