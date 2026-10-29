// Arma el cliente de Cobre según `COBRE_MODO` y da la clave con la que se firman los webhooks.
// - `simulado`: cliente contra el simulador (tabla `cobre_simulador`); la clave de webhooks se
//   deriva de la service role key (nunca sale del servidor), así no hace falta configurar nada.
// - `prueba` / `produccion`: `COBRE_USER_ID`, `COBRE_SECRET` y `COBRE_WEBHOOK_KEY` (la
//   `event_signature_key` de la suscripción), más `COBRE_BASE_URL` en prueba.
//
// Instancias (Solution Design §3.0): la **matriz** de JPay usa los secretos de arriba; un comercio
// con instancia Cobre propia (`cobre_instancias`) usa sus credenciales y su clave de avisos, que
// viven en Vault (`cobre_instancia_leer`, solo service role). Nunca se mezclan: cada instancia
// tiene su token, sus Balances, sus avisos (`cobre-webhook?instancia=<id>`) y su conciliación.
//
// Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  baseUrlCobre,
  CobreCliente,
  CobreError,
  credencialesCobre,
  firmarCobre,
  modoCobre,
  type CredencialesCobre,
  type ModoCobre,
} from "./cobre.ts";
import { almacenSupabase, fetchSimulado, type AlmacenSim } from "./cobre-simulador.ts";

export type ConexionCobre = {
  modo: ModoCobre;
  cliente: CobreCliente;
  /** Solo en modo simulado. */
  almacen: AlmacenSim | null;
  /** Instancia propia del comercio; null = matriz de JPay. */
  instanciaId: string | null;
};

/** Instancia Cobre propia de un comercio, con sus secretos leídos de Vault. */
export type InstanciaCobre = {
  id: string;
  clienteLegajo: string;
  baseUrl: string | null;
  credenciales: CredencialesCobre;
  claveWebhook: string | null;
};

export function conexionCobre(
  sb: SupabaseClient,
  instancia?: InstanciaCobre | null,
): ConexionCobre {
  const modo = modoCobre();
  const instanciaId = instancia?.id ?? null;
  if (modo === "simulado") {
    const almacen = almacenSupabase(sb);
    return {
      modo,
      almacen,
      instanciaId,
      cliente: new CobreCliente({
        baseUrl: baseUrlCobre(modo),
        credenciales: instancia?.credenciales ?? { userId: "simulador", secret: "simulador" },
        fetch: fetchSimulado(almacen),
      }),
    };
  }
  const cred = instancia?.credenciales ?? credencialesCobre();
  if (!cred) throw new CobreError(500, "Faltan COBRE_USER_ID o COBRE_SECRET en los secretos");
  const baseUrl = instancia?.baseUrl ? instancia.baseUrl.replace(/\/+$/, "") : baseUrlCobre(modo);
  return {
    modo,
    almacen: null,
    instanciaId,
    cliente: new CobreCliente({ baseUrl, credenciales: cred }),
  };
}

/** Lee una instancia por id (con secretos). null si no existe o está inactiva. */
export async function instanciaCobre(
  sb: SupabaseClient,
  id: string,
): Promise<InstanciaCobre | null> {
  const { data, error } = await sb.rpc("cobre_instancia_leer", { p_instancia_id: id });
  if (error) throw new CobreError(500, `No se pudo leer la instancia: ${error.message}`);
  const d = data as Record<string, unknown> | null;
  if (!d || d.estado !== "activa" || d.modo !== modoCobre()) return null;
  if (typeof d.user_id !== "string" || typeof d.secret !== "string" || !d.secret) {
    throw new CobreError(409, "La instancia Cobre del comercio no tiene credenciales cargadas");
  }
  return {
    id,
    clienteLegajo: String(d.cliente_legajo),
    baseUrl: typeof d.base_url === "string" && d.base_url ? d.base_url : null,
    credenciales: { userId: d.user_id, secret: d.secret },
    claveWebhook: typeof d.clave_webhook === "string" && d.clave_webhook ? d.clave_webhook : null,
  };
}

/** Instancia propia del comercio, si tiene una activa en el modo actual (si no, la matriz). */
export async function instanciaDeCliente(
  sb: SupabaseClient,
  legajo: string,
): Promise<InstanciaCobre | null> {
  const { data } = await sb
    .from("cobre_instancias")
    .select("id")
    .eq("cliente_legajo", legajo)
    .eq("modo", modoCobre())
    .eq("estado", "activa")
    .maybeSingle();
  return data ? await instanciaCobre(sb, data.id) : null;
}

/** Conexión con la instancia que corresponde al comercio (la suya o la matriz). */
export async function conexionDeCliente(
  sb: SupabaseClient,
  legajo: string,
): Promise<ConexionCobre> {
  return conexionCobre(sb, await instanciaDeCliente(sb, legajo));
}

/** Clave para verificar (y, en el simulador, firmar) los webhooks; null si falta. */
export async function claveWebhookCobre(
  modo: ModoCobre = modoCobre(),
  instancia?: InstanciaCobre | null,
): Promise<string | null> {
  if (modo !== "simulado") {
    return instancia ? instancia.claveWebhook : (Deno.env.get("COBRE_WEBHOOK_KEY") ?? null);
  }
  // El simulador es uno solo (un almacén para todas las instancias) y firma con una sola clave.
  const base = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return base ? await firmarCobre(base, "cobre-simulador", "webhooks") : null;
}

/** URL pública de `cobre-webhook` en este proyecto (con la instancia, si no es la matriz). */
export function urlWebhookCobre(instanciaId?: string | null): string {
  const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cobre-webhook`;
  return instanciaId ? `${base}?instancia=${instanciaId}` : base;
}

/** Eventos a los que se suscribe cada instancia (Solution Design §5). */
export const EVENTOS_COBRE = [
  "accounts.balance.credit",
  "accounts.balance.debit",
  "money_movements.status.initiated",
  "money_movements.status.processing",
  "money_movements.status.pending_approval",
  "money_movements.status.completed",
  "money_movements.status.rejected",
  "money_movements.status.failed",
  "money_movements.status.canceled",
  "cross_border_money_movements.status.initiated",
  "cross_border_money_movements.status.processing",
  "cross_border_money_movements.status.completed",
  "cross_border_money_movements.status.rejected",
  "cross_border_money_movements.status.failed",
  "cross_border_money_movements.status.pending_funds",
  "bulk_money_movements.status.validating",
  "bulk_money_movements.status.processing",
  "bulk_money_movements.status.pending_approval",
  "bulk_money_movements.status.completed",
  "bulk_money_movements.status.failed",
  "bulk_money_movements.status.canceled",
  "subclient.status.processing",
  "subclient.status.approved",
  "subclient.status.rejected",
  "subclient.status.failed",
];
