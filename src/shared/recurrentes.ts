// Suscripciones (tarjeta) y domiciliaciones (CLABE) con Ecart Pay: lectura de las tablas (RLS:
// el comercio dueño o el backoffice) y acciones por las Edge Functions `ecartpay-suscripciones` y
// `ecartpay-domiciliaciones`. Lo usan el portal (su comercio) y el admin (el comercio elegido).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";

export const INTERVALOS: { value: string; label: string; plural: string }[] = [
  { value: "daily", label: "Diario", plural: "días" },
  { value: "weekly", label: "Semanal", plural: "semanas" },
  { value: "monthly", label: "Mensual", plural: "meses" },
  { value: "quarterly", label: "Trimestral", plural: "trimestres" },
  { value: "semiannual", label: "Semestral", plural: "semestres" },
  { value: "yearly", label: "Anual", plural: "años" },
];
export const intervaloLabel = (v: string | null) =>
  INTERVALOS.find((i) => i.value === v)?.label ?? v ?? "—";

export type Suscripcion = {
  id: string;
  suscriptor_nombre: string;
  suscriptor_email: string;
  servicio: string;
  beneficios: string[];
  monto: number;
  moneda: string;
  intervalo: string;
  frecuencia: number;
  dias_prueba: number;
  ciclo_dia: number | null;
  fecha_fin: string | null;
  estado: string;
  checkout_link: string | null;
  intentos: number;
  proximo_cobro: string | null;
  ultimo_error: string | null;
  created_at: string;
};

export type Domiciliacion = {
  id: string;
  titular_nombre: string;
  titular_email: string;
  titular_rfc: string | null;
  clabe: string;
  concepto: string;
  monto: number;
  moneda: string;
  recurrente: boolean;
  intervalo: string | null;
  ciclo_dia: number | null;
  estado: string;
  referencia: string | null;
  proximo_cobro: string | null;
  ultimo_error: string | null;
  created_at: string;
};

export type CobroRecurrente = {
  id: string;
  tipo: "suscripcion" | "domiciliacion";
  suscripcion_id: string | null;
  domiciliacion_id: string | null;
  monto: number;
  moneda: string;
  estado: "pagado" | "fallido";
  motivo: string | null;
  cobrado_at: string;
};

async function listar<T>(tabla: string, comercioId: string): Promise<T[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from(tabla as "suscripciones")
    .select("*")
    .eq("comercio_id", comercioId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as T[];
}

export const listSuscripciones = (comercioId: string) =>
  listar<Suscripcion>("suscripciones", comercioId);
export const listDomiciliaciones = (comercioId: string) =>
  listar<Domiciliacion>("domiciliaciones", comercioId);

export async function listCobrosRecurrentes(comercioId: string): Promise<CobroRecurrente[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("cobros_recurrentes")
    .select("id, tipo, suscripcion_id, domiciliacion_id, monto, moneda, estado, motivo, cobrado_at")
    .eq("comercio_id", comercioId)
    .order("cobrado_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CobroRecurrente[];
}

/** Llama a la Edge Function y devuelve el mensaje del servidor si falla. */
async function invocar<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<T>(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(cuerpo?.error ? String(cuerpo.error) : error.message);
  }
  return data as T;
}

export type NuevaSuscripcionInput = {
  nombre: string;
  email: string;
  telefono?: string;
  servicio: string;
  beneficios: string[];
  monto: number;
  moneda: "MXN" | "USD";
  intervalo: string;
  frecuencia: number;
  dias_prueba: number;
  ciclo_dia: number | null;
  fecha_fin: string | null;
  compromiso_periodos: number | null;
};

export type NuevaDomiciliacionInput = {
  nombre: string;
  email: string;
  telefono?: string;
  rfc: string | null;
  clabe: string;
  alias: string;
  concepto: string;
  monto: number;
  recurrente: boolean;
  intervalo: string | null;
  ciclo_dia: number | null;
  fecha_fin: string | null;
};

const KEY = ["recurrentes"] as const;

export function useSuscripciones(comercioId: string | null) {
  return useQuery({
    queryKey: [...KEY, "suscripciones", comercioId],
    queryFn: () => listSuscripciones(comercioId as string),
    enabled: !!comercioId,
  });
}

export function useDomiciliaciones(comercioId: string | null) {
  return useQuery({
    queryKey: [...KEY, "domiciliaciones", comercioId],
    queryFn: () => listDomiciliaciones(comercioId as string),
    enabled: !!comercioId,
  });
}

export function useCobrosRecurrentes(comercioId: string | null) {
  return useQuery({
    queryKey: [...KEY, "cobros", comercioId],
    queryFn: () => listCobrosRecurrentes(comercioId as string),
    enabled: !!comercioId,
  });
}

/** Acciones; todas refrescan los listados. Cada alta lleva su clave de intento (idempotencia). */
export function useRecurrentesMutaciones(comercioId: string | null) {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: KEY });
  const base = () => {
    if (!comercioId) throw new Error("No hay comercio seleccionado");
    return { comercio_id: comercioId };
  };
  return {
    crearSuscripcion: useMutation({
      mutationFn: (v: NuevaSuscripcionInput & { idempotency_key: string }) =>
        invocar<Suscripcion>("ecartpay-suscripciones", { ...base(), accion: "crear", ...v }),
      onSuccess,
    }),
    accionSuscripcion: useMutation({
      mutationFn: (v: { id: string; accion: "sincronizar" | "pausar" | "reanudar" | "cancelar" }) =>
        invocar<Suscripcion>("ecartpay-suscripciones", { ...base(), ...v }),
      onSuccess,
    }),
    crearDomiciliacion: useMutation({
      mutationFn: (v: NuevaDomiciliacionInput & { idempotency_key: string }) =>
        invocar<Domiciliacion>("ecartpay-domiciliaciones", { ...base(), accion: "crear", ...v }),
      onSuccess,
    }),
    accionDomiciliacion: useMutation({
      mutationFn: (v: { id: string; accion: "sincronizar" | "cancelar" }) =>
        invocar<Domiciliacion>("ecartpay-domiciliaciones", { ...base(), ...v }),
      onSuccess,
    }),
  };
}

/** Clave nueva por intento de alta (si se reintenta el mismo envío, Ecart Pay no duplica). */
export const nuevaClave = () => crypto.randomUUID();
