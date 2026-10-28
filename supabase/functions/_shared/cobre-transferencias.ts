// Aplica el estado de un money movement de Cobre a la transferencia de JPay y a su ledger.
// Único punto que cierra una transferencia: lo usan `cobre-webhook`, `cobre-transferencias` y
// la revisión de pendientes. Idempotente: un estado final no se vuelve a aplicar.
//   completada                       → cobre_confirmar_transferencia (contabiliza el envío)
//   rechazada / fallida / cancelada  → cancelar_transferencia_bdc (libera la reserva)

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { resumirTransferencia, SIN_DEBITO, type EstadoTransferencia } from "./cobre.ts";

const FINALES: EstadoTransferencia[] = ["completada", ...SIN_DEBITO];

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
  if (FINALES.includes(fila.estado as EstadoTransferencia) || fila.estado === "error_envio") {
    return { estado: fila.estado, cambio: false };
  }

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

  const { error } = await sb
    .from("cobre_transferencias")
    .update({
      mm_id: fila.mm_id ?? (r.id || null),
      estado: r.estado,
      codigo: r.codigo,
      motivo: r.motivo,
      clave_rastreo: r.claveRastreo,
      cep: r.cep,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fila.id);
  if (error) throw new Error(error.message);
  return { estado: r.estado, cambio: r.estado !== fila.estado };
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
