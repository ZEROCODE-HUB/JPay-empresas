// Aplica el estado de un money movement de Cobre a la transferencia de JPay y a su ledger.
// Único punto que cierra una transferencia: lo usan `cobre-webhook`, `cobre-transferencias` y
// la revisión de pendientes. Idempotente: un estado final no se vuelve a aplicar.
//   completada                       → cobre_confirmar_transferencia (contabiliza el envío)
//   rechazada / fallida / cancelada  → cancelar_transferencia_bdc (libera la reserva)
// Un rebote posterior a `completed` (crédito `spei_rejected` o `spei_return`) no cambia el estado
// del money movement: lo aplica `aplicarRebote` (estado `devuelta`, reintegro una sola vez).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  resumirTransferencia,
  SIN_DEBITO,
  type EstadoTransferencia,
  type ModoCobre,
} from "./cobre.ts";

const FINALES: string[] = ["completada", "devuelta", ...SIN_DEBITO];

export type FilaTransferencia = {
  id: string;
  id_txn: string;
  estado: string;
  mm_id: string | null;
};

export async function aplicarEstadoTransferencia(
  sb: SupabaseClient,
  fila: FilaTransferencia,
  mm: unknown,
): Promise<{ estado: string; cambio: boolean }> {
  const r = resumirTransferencia(mm);
  if (FINALES.includes(fila.estado) || fila.estado === "error_envio") {
    return { estado: fila.estado, cambio: false };
  }
  // Un aviso intermedio no hace retroceder lo que ya avanzó (Cobre reintenta y desordena avisos).
  if (r.estado === "pendiente" && fila.estado === "pendiente")
    return { estado: fila.estado, cambio: false };

  if (r.estado === "completada") {
    const { error } = await sb.rpc("cobre_confirmar_transferencia", { p_id_txn: fila.id_txn });
    if (error) throw new Error(`No se pudo contabilizar ${fila.id_txn}: ${error.message}`);
  } else if (SIN_DEBITO.includes(r.estado)) {
    const { error } = await sb.rpc("cancelar_transferencia_bdc", {
      p_origin_id: fila.id_txn,
      p_motivo: r.motivo ?? r.estadoCobre,
    });
    if (error) throw new Error(`No se pudo liberar ${fila.id_txn}: ${error.message}`);
  }

  const meta = ((mm ?? {}) as Record<string, unknown>).metadata as
    Record<string, unknown> | undefined;
  const uetr = typeof meta?.swift_uetr === "string" && meta.swift_uetr ? meta.swift_uetr : null;
  const { error } = await sb
    .from("cobre_transferencias")
    .update({
      mm_id: fila.mm_id ?? (r.id || null),
      estado: r.estado,
      codigo: r.codigo,
      motivo: r.motivo,
      clave_rastreo: r.claveRastreo,
      cep: r.cep,
      ...(uetr ? { swift_uetr: uetr } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", fila.id);
  if (error) throw new Error(error.message);
  return { estado: r.estado, cambio: r.estado !== fila.estado };
}

/**
 * Rebote de un envío que Cobre ya había dado por `completed`: revierte el envío y la reserva
 * (`cobre_reintegrar_transferencia`) y lo deja `devuelta`. Idempotente.
 */
export async function aplicarRebote(
  sb: SupabaseClient,
  modo: ModoCobre,
  ref: { mmId: string | null; externalId: string | null },
): Promise<string> {
  const mm = (ref.mmId ?? "").replace(/[^\w-]/g, "");
  const ext = (ref.externalId ?? "").replace(/[^\w-]/g, "");
  if (!mm && !ext) return "sin referencia";
  const { data: t } = await sb
    .from("cobre_transferencias")
    .select("id, id_txn, estado")
    .eq("modo", modo)
    .or(`mm_id.eq.${mm || "-"},id_txn.eq.${ext || "-"}`)
    .limit(1)
    .maybeSingle();
  if (!t) return "de un envío desconocido";
  if (t.estado === "devuelta") return "ya aplicado";
  // Antes de `completed` el reintegro lo hace el estado `rejected` del propio envío.
  if (t.estado !== "completada") return `ignorado (envío ${t.estado})`;
  const motivo = "El banco de destino devolvió la transferencia";
  const { error } = await sb.rpc("cobre_reintegrar_transferencia", {
    p_id_txn: t.id_txn,
    p_motivo: motivo,
  });
  if (error) throw new Error(`No se pudo reintegrar ${t.id_txn}: ${error.message}`);
  const ahora = new Date().toISOString();
  const { error: e2 } = await sb
    .from("cobre_transferencias")
    .update({ estado: "devuelta", motivo, devuelta_at: ahora, updated_at: ahora })
    .eq("id", t.id);
  if (e2) throw new Error(e2.message);
  return "reintegrado";
}

export type FilaDevolucion = { id: string; devolucion_estado: string | null };

/** Aplica el estado del money movement `spei_return` a la devolución de un depósito. */
export async function aplicarEstadoDevolucion(
  sb: SupabaseClient,
  dep: FilaDevolucion,
  mm: unknown,
): Promise<string> {
  const r = resumirTransferencia(mm);
  if (dep.devolucion_estado === "completada") return "completada";
  const { error } = await sb
    .from("cobre_depositos")
    .update({
      devolucion_mm_id: r.id || undefined,
      devolucion_estado: r.estado,
      devolucion_motivo: r.motivo,
      ...(r.estado === "completada"
        ? { estado: "devuelto", devuelto_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", dep.id);
  if (error) throw new Error(error.message);
  return r.estado;
}
