import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { DataAccessError } from "@/lib/api/errors";

/**
 * Puntos físicos del comercio (Fase 7 de Ecart Pay): sucursales → cajas → terminales.
 * La lectura va directo por RLS; toda escritura pasa por la Edge Function `ecartpay-pos`, que
 * primero la hace en Ecart Pay.
 */

export type Sucursal = Pick<
  Tables<"sucursales">,
  | "id"
  | "nombre"
  | "calle"
  | "ciudad"
  | "estado_region"
  | "codigo_postal"
  | "telefono"
  | "email"
  | "encargado"
  | "timezone"
  | "estado"
  | "id_externo"
  | "sincronizado_at"
> & { cajas: Caja[] };

export type Caja = Pick<
  Tables<"cajas">,
  | "id"
  | "sucursal_id"
  | "nombre"
  | "numero"
  | "estado"
  | "terminal_id"
  | "permite_reembolsos"
  | "tope_reembolso"
  | "requiere_aprobacion"
  | "umbral_aprobacion"
  | "copias_ticket"
  | "id_externo"
>;

export type Terminal = Pick<
  Tables<"terminales">,
  "id" | "serie" | "tipo" | "modo" | "es_punto_venta" | "estado" | "id_externo"
>;

export type PuntosFisicos = { sucursales: Sucursal[]; terminales: Terminal[] };

const COLS_SUC =
  "id, nombre, calle, ciudad, estado_region, codigo_postal, telefono, email, encargado, timezone, estado, id_externo, sincronizado_at";
const COLS_CAJA =
  "id, sucursal_id, nombre, numero, estado, terminal_id, permite_reembolsos, tope_reembolso, requiere_aprobacion, umbral_aprobacion, copias_ticket, id_externo";

export async function listPuntosFisicos(comercioId: string): Promise<PuntosFisicos> {
  const sb = requireSupabase();
  const [suc, term] = await Promise.all([
    sb
      .from("sucursales")
      .select(`${COLS_SUC}, cajas(${COLS_CAJA}, eliminado_at)`)
      .eq("comercio_id", comercioId)
      .is("eliminado_at", null)
      .order("nombre"),
    sb
      .from("terminales")
      .select("id, serie, tipo, modo, es_punto_venta, estado, id_externo")
      .eq("comercio_id", comercioId)
      .order("serie"),
  ]);
  if (suc.error) throw new DataAccessError(suc.error);
  if (term.error) throw new DataAccessError(term.error);
  const sucursales = (suc.data ?? []).map((s) => ({
    ...s,
    cajas: (s.cajas ?? [])
      .filter((c) => !c.eliminado_at)
      .map(({ eliminado_at: _e, ...c }) => c)
      .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true })),
  }));
  return { sucursales, terminales: term.data ?? [] };
}

export type SucursalInput = {
  id?: string;
  nombre: string;
  calle?: string;
  ciudad?: string;
  estado_region?: string;
  codigo_postal?: string;
  telefono?: string;
  email?: string;
  encargado?: string;
  estado?: string;
};

export type CajaInput = {
  id?: string;
  sucursal_id?: string;
  nombre: string;
  numero: string;
  estado?: string;
  permite_reembolsos?: boolean;
  tope_reembolso?: number | null;
  requiere_aprobacion?: boolean;
  umbral_aprobacion?: number | null;
  copias_ticket?: number;
};

/** Llama a `ecartpay-pos`; los errores HTTP traen el mensaje útil en el cuerpo. */
export async function accionPos<T = { ok: boolean }>(
  comercioId: string,
  accion: string,
  datos: Record<string, unknown> = {},
): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<T>("ecartpay-pos", {
    body: { accion, comercio_id: comercioId, ...datos },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo =
      ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new DataAccessError(cuerpo?.error ? new Error(cuerpo.error) : error);
  }
  return data as T;
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

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
