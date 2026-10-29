// Lotes de envíos SPEI (Solution Design §4.3, `POST /bulk_money_movements`): un archivo JSON
// (multipart, campo `file`) con un money movement SPEI por ítem, todos desde el Balance del
// comercio. El lote (`bat_…`) solo dice si el archivo se procesó: cada ítem es una
// `cobre_transferencias` (con `lote_id`) que se cierra por su propio `money_movements.status.*`
// (`external_id` = TXID del ítem).
// Cobre no publica la respuesta del POST: el lote se reconoce por `input_filename`, que es único
// (`jpay-lote-<id>.json`), y por `id` cuando llega el primer aviso.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { CobreError, type ModoCobre } from "./cobre.ts";
import type { ConexionCobre } from "./cobre-servidor.ts";

type Obj = Record<string, unknown>;

/** Tamaño máximo del archivo que acepta Cobre (≈ 4.7 MB). */
export const MAX_BYTES_LOTE = 4_700_000;

export const nombreArchivoLote = (loteId: string) => `jpay-lote-${loteId}.json`;

/** Arma el multipart del lote. Todos los ítems deben ser SPEI (un solo `type` por archivo). */
export function archivoLote(nombre: string, items: Obj[]): FormData {
  const json = JSON.stringify(items);
  if (new TextEncoder().encode(json).length > MAX_BYTES_LOTE) {
    throw new CobreError(400, "El lote supera el tamaño máximo de Cobre (4.7 MB): dividilo");
  }
  const fd = new FormData();
  fd.append("file", new File([json], nombre, { type: "application/json" }));
  return fd;
}

/** Sube el lote a Cobre. Los ítems ya están reservados en el ledger y guardados como `enviando`. */
export async function enviarLote(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  lote: { id: string; archivo: string },
  items: Obj[],
): Promise<string> {
  await sb
    .from("cobre_lotes")
    .update({ estado: "enviando", updated_at: new Date().toISOString() })
    .eq("id", lote.id);
  let r: Obj | null;
  try {
    r = await conexion.cliente.post<Obj | null>(
      "/bulk_money_movements",
      archivoLote(lote.archivo, items),
    );
  } catch (e) {
    if (
      e instanceof CobreError &&
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 408 &&
      e.status !== 429
    ) {
      await cerrarItemsSinMovimiento(
        sb,
        conexion.modo,
        lote.id,
        `Cobre rechazó el lote: ${e.message}`,
      );
      await sb
        .from("cobre_lotes")
        .update({ estado: "error_envio", motivo: e.message, updated_at: new Date().toISOString() })
        .eq("id", lote.id);
    }
    throw e;
  }
  const batId = typeof r?.id === "string" ? r.id : null;
  const estado = ((r?.status ?? {}) as Obj).state;
  await sb
    .from("cobre_lotes")
    .update({
      ...(batId ? { lote_externo_id: batId } : {}),
      estado: typeof estado === "string" ? estado : "validating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", lote.id);
  return batId ?? "enviado";
}

/** Aviso `bulk_money_movements.status.*` (o GET /bulk_money_movements/{id}). */
export async function aplicarEstadoLote(sb: SupabaseClient, bat: unknown): Promise<string> {
  const b = (bat ?? {}) as Obj;
  const id = typeof b.id === "string" ? b.id : "";
  const archivo = typeof b.input_filename === "string" ? b.input_filename : "";
  const st = (b.status ?? {}) as Obj;
  const estado = typeof st.state === "string" ? st.state : null;
  if (!estado) return "sin estado";
  let q = sb.from("cobre_lotes").select("id, modo, estado, lote_externo_id");
  q =
    id && archivo
      ? q.or(
          `lote_externo_id.eq.${id.replace(/[^\w-]/g, "")},archivo.eq.${archivo.replace(/[^\w.-]/g, "")}`,
        )
      : id
        ? q.eq("lote_externo_id", id)
        : q.eq("archivo", archivo);
  const { data: lote } = await q.limit(1).maybeSingle();
  if (!lote) return "desconocido";
  const finales = ["completed", "canceled", "failed"];
  if (finales.includes(lote.estado)) return lote.estado;
  const motivo = typeof st.description === "string" && st.description ? st.description : null;
  await sb
    .from("cobre_lotes")
    .update({
      estado,
      lote_externo_id: lote.lote_externo_id ?? (id || null),
      motivo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lote.id);
  if (estado === "failed" || estado === "canceled") {
    await cerrarItemsSinMovimiento(
      sb,
      lote.modo as ModoCobre,
      lote.id,
      motivo ??
        (estado === "failed" ? "El archivo no pasó la validación de Cobre" : "Lote cancelado"),
    );
  }
  return estado;
}

/** Ítems que nunca llegaron a ser money movements: se liberan sus reservas. */
export async function cerrarItemsSinMovimiento(
  sb: SupabaseClient,
  modo: ModoCobre,
  loteId: string,
  motivo: string,
): Promise<number> {
  const { data: items } = await sb
    .from("cobre_transferencias")
    .select("id, id_txn")
    .eq("modo", modo)
    .eq("lote_id", loteId)
    .eq("estado", "enviando")
    .is("mm_id", null);
  let n = 0;
  for (const t of (items ?? []) as { id: string; id_txn: string }[]) {
    const { error } = await sb.rpc("cancelar_transferencia_bdc", {
      p_origin_id: t.id_txn,
      p_motivo: motivo,
    });
    if (error) throw new Error(`No se pudo liberar ${t.id_txn}: ${error.message}`);
    await sb
      .from("cobre_transferencias")
      .update({ estado: "fallida", motivo, updated_at: new Date().toISOString() })
      .eq("id", t.id);
    n++;
  }
  return n;
}
