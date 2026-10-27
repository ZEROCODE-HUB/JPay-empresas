import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toDataError } from "@/lib/supabase";
import {
  getContextoTransferencias,
  listDrafts,
  listFrequentRecipients,
  listScheduledTransfers,
  listSubcuentasOrigenSesion,
  listTemplates,
  type Draft,
  type FrequentRecipient,
  type Scheduled,
  type Template,
} from "@/lib/api/transferencias";

type Updater<T> = T | ((prev: T) => T);
const aplicar = <T>(u: Updater<T>, prev: T): T =>
  typeof u === "function" ? (u as (p: T) => T)(prev) : u;

const KEY_CONTEXTO = ["transferencias", "contexto"] as const;
const KEY_LISTAS = ["transferencias", "listas"] as const;
const KEY_PLANTILLAS = ["transferencias", "plantillas"] as const;

/** Cliente, subcuentas de origen y enviado en el mes. */
export function useContextoTransferencias() {
  const query = useQuery({ queryKey: KEY_CONTEXTO, queryFn: getContextoTransferencias });
  return {
    subcuentas: query.data?.subcuentas ?? [],
    clienteCuit: query.data?.clienteCuit ?? "",
    clienteNombre: query.data?.clienteNombre ?? "",
    totalDisponible: (query.data?.subcuentas ?? []).reduce(
      (s, x) => s + (Number(x.saldo_disponible) || 0),
      0,
    ),
    enviadoMes: query.data?.enviadoMes ?? { monto: 0, ops: 0 },
    isLoading: query.isLoading,
    recargar: async () => {
      await query.refetch();
    },
  };
}

type Listas = { drafts: Draft[]; scheduled: Scheduled[]; frecuentes: FrequentRecipient[] };
const LISTAS_VACIAS: Listas = { drafts: [], scheduled: [], frecuentes: [] };

async function listarListas(): Promise<Listas> {
  const [drafts, scheduled, frecuentes] = await Promise.all([
    listDrafts(),
    listScheduledTransfers(),
    listFrequentRecipients(),
  ]);
  return { drafts, scheduled, frecuentes };
}

/**
 * Borradores, programadas, destinatarios frecuentes y plantillas. Las plantillas
 * se cargan aparte a propósito: si su tabla falla no rompe las demás listas.
 * Los setters editan la caché como si fuera estado local.
 */
export function useListasTransferencias() {
  const queryClient = useQueryClient();
  const listas = useQuery({ queryKey: KEY_LISTAS, queryFn: listarListas, retry: false });
  const plantillas = useQuery({
    queryKey: KEY_PLANTILLAS,
    queryFn: listTemplates,
    enabled: listas.isSuccess,
    retry: false,
  });

  const setLista = useCallback(
    <K extends keyof Listas>(k: K, u: Updater<Listas[K]>) =>
      queryClient.setQueryData<Listas>(KEY_LISTAS, (prev) => {
        const base = prev ?? LISTAS_VACIAS;
        return { ...base, [k]: aplicar(u, base[k]) };
      }),
    [queryClient],
  );

  const setDrafts = useCallback((u: Updater<Draft[]>) => setLista("drafts", u), [setLista]);
  const setScheduled = useCallback(
    (u: Updater<Scheduled[]>) => setLista("scheduled", u),
    [setLista],
  );
  const setFrecuentes = useCallback(
    (u: Updater<FrequentRecipient[]>) => setLista("frecuentes", u),
    [setLista],
  );
  const setTemplates = useCallback(
    (u: Updater<Template[]>) =>
      queryClient.setQueryData<Template[]>(KEY_PLANTILLAS, (prev) => aplicar(u, prev ?? [])),
    [queryClient],
  );

  /** Refresca solo las programadas (al abrir esa pestaña, por si el worker ejecutó alguna). */
  const refreshScheduledTransfers = useCallback(async () => {
    try {
      setScheduled(await listScheduledTransfers());
    } catch {
      // el error de listas ya se muestra en la pantalla
    }
  }, [setScheduled]);

  return {
    drafts: listas.data?.drafts ?? [],
    scheduled: listas.data?.scheduled ?? [],
    frecuentes: listas.data?.frecuentes ?? [],
    listasError: listas.isError ? toDataError(listas.error).message : null,
    templates: plantillas.data ?? [],
    templatesError: plantillas.isError ? toDataError(plantillas.error).message : null,
    setDrafts,
    setScheduled,
    setFrecuentes,
    setTemplates,
    refreshScheduledTransfers,
  };
}

/** Agenda de destinatarios frecuentes (pantalla Destinatarios). */
export function useDestinatariosFrecuentes() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["destinatarios", "frecuentes"],
    queryFn: listFrequentRecipients,
    retry: false,
  });
  const setFrecuentes = useCallback(
    (u: Updater<FrequentRecipient[]>) =>
      queryClient.setQueryData<FrequentRecipient[]>(["destinatarios", "frecuentes"], (prev) =>
        aplicar(u, prev ?? []),
      ),
    [queryClient],
  );
  return {
    frecuentes: query.data ?? [],
    cargando: query.isFetching,
    setFrecuentes,
    recargar: async () => {
      await query.refetch();
    },
  };
}

/** Subcuentas de origen (con saldo) de la agenda de destinatarios. */
export function useSubcuentasOrigen() {
  const query = useQuery({
    queryKey: ["subcuentas", "origen"],
    queryFn: listSubcuentasOrigenSesion,
  });
  return {
    subcuentas: query.data ?? [],
    recargar: async () => (await query.refetch()).data ?? null,
  };
}
