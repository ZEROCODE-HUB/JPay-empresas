// Procesa un aviso de Cobre ya verificado (lo usan `cobre-webhook`, la conciliación y la revisión
// de pendientes). Ruteo por familia de `event_key` (Solution Design §5):
//   accounts.balance.credit        spei_credit → depósito; r2p_spei_credit → cobro R2P;
//                                  spei_rejected → rebote de un envío ya completado
//   money_movements.status.*       según `content.type`: spei (envío o ítem de lote),
//                                  spei_return (devolución de depósito o rebote), r2p_spei,
//                                  global_pay_to_usa, fedwire, swift
//   subclient.status.*             alta KYB del comercio → crea su Cobre Balance al aprobarse
//   cross_border_money_movements.* conversión MXN→USD
//   bulk_money_movements.status.*  lote de envíos (los ítems se cierran por su propio estado)
// Nunca se avanza un estado con un evento no terminal hacia atrás: cada aplicador ignora lo que ya
// está en un estado final.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { claveEvento, depositoSpei, transaccionCobre, type ModoCobre } from "./cobre.ts";
import type { ConexionCobre } from "./cobre-servidor.ts";
import {
  aplicarEstadoDevolucion,
  aplicarEstadoTransferencia,
  aplicarRebote,
} from "./cobre-transferencias.ts";
import { aplicarEstadoSubcliente } from "./cobre-subclientes.ts";
import { aplicarEstadoCobroR2p, acreditarCobroR2p } from "./cobre-r2p.ts";
import { aplicarEstadoLote } from "./cobre-lotes.ts";
import { aplicarEstadoCruce, aplicarEstadoEnvioUsd } from "./cobre-usd.ts";

type Obj = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" ? v : "");

export async function procesarEventoCobre(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  evento: string | null,
  contenido: Obj,
): Promise<string> {
  const { familia } = claveEvento(evento);
  const modo = conexion.modo;
  switch (familia) {
    case "accounts.balance":
      return evento === "accounts.balance.credit"
        ? await credito(sb, modo, contenido)
        : `débito ${txt(contenido.type) || "?"} registrado`;
    case "money_movements":
      return await movimiento(sb, conexion, contenido);
    case "subclient":
      return `subcliente ${await aplicarEstadoSubcliente(sb, conexion, contenido)}`;
    case "cross_border_money_movements":
      return `cruce ${await aplicarEstadoCruce(sb, conexion, contenido, evento)}`;
    case "bulk_money_movements":
      return `lote ${await aplicarEstadoLote(sb, contenido)}`;
    default:
      return "registrado";
  }
}

async function credito(sb: SupabaseClient, modo: ModoCobre, c: Obj): Promise<string> {
  const tipo = txt(c.type);
  if (tipo === "spei_credit") {
    const d = depositoSpei(c)!;
    const { data, error } = await sb.rpc("cobre_registrar_deposito", {
      p_modo: modo,
      p_transaccion_id: d.transaccionId,
      p_cuenta_externa_id: d.cuentaId ?? undefined,
      p_clabe: d.clabeDestino ?? undefined,
      p_monto: d.monto,
      p_remitente: d.remitente ?? undefined,
      p_remitente_cuenta: d.remitenteCuenta ?? undefined,
      p_remitente_id: d.remitenteId ?? undefined,
      p_clave_rastreo: d.claveRastreo ?? undefined,
      p_cep: d.cep ?? undefined,
      p_fecha: d.fecha ?? undefined,
    });
    if (error) throw new Error(error.message);
    return `depósito ${(data as { estado?: string } | null)?.estado ?? "?"}`;
  }
  if (tipo === "r2p_spei_credit") return `cobro R2P ${await acreditarCobroR2p(sb, modo, c)}`;
  if (tipo === "spei_rejected") {
    const t = transaccionCobre(c);
    return `rebote ${await aplicarRebote(sb, modo, { mmId: t.mmId, externalId: t.mmExternalId })}`;
  }
  return `crédito ${tipo || "?"} registrado`;
}

async function movimiento(sb: SupabaseClient, conexion: ConexionCobre, c: Obj): Promise<string> {
  const tipo = txt(c.type);
  const modo = conexion.modo;
  if (tipo === "spei_return") {
    // Devolución de un depósito (external_id = transacción devuelta) o rebote de un envío.
    const ext = txt(c.external_id);
    const { data: dep } = await sb
      .from("cobre_depositos")
      .select("id, devolucion_estado")
      .eq("modo", modo)
      .eq("transaccion_externa_id", ext)
      .maybeSingle();
    if (dep) return `devolución ${await aplicarEstadoDevolucion(sb, dep, c)}`;
    const st = (c.status ?? {}) as Obj;
    if (st.state !== "completed") return "reverso en curso";
    return `rebote ${await aplicarRebote(sb, modo, { mmId: null, externalId: ext || null })}`;
  }
  if (tipo === "r2p_spei") return `cobro R2P ${await aplicarEstadoCobroR2p(sb, modo, c)}`;
  if (tipo === "global_pay_to_usa" || tipo === "fedwire" || tipo === "swift") {
    return `envío USD ${await aplicarEstadoEnvioUsd(sb, conexion, c)}`;
  }
  const mmId = txt(c.id).replace(/[^\w-]/g, "");
  const ext = txt(c.external_id).replace(/[^\w-]/g, "");
  if (!mmId && !ext) return "movimiento sin id";
  const { data: t } = await sb
    .from("cobre_transferencias")
    .select("id, id_txn, estado, mm_id")
    .eq("modo", modo)
    .or(`mm_id.eq.${mmId || "-"},id_txn.eq.${ext || "-"}`)
    .limit(1)
    .maybeSingle();
  if (!t) return "transferencia desconocida";
  const r = await aplicarEstadoTransferencia(sb, t, c);
  return `transferencia ${r.estado}`;
}
