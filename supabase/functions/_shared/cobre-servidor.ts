// Arma el cliente de Cobre según `COBRE_MODO` y da la clave con la que se firman los webhooks.
// - `simulado`: cliente contra el simulador (tabla `cobre_simulador`); la clave de webhooks se
//   deriva de la service role key (nunca sale del servidor), así no hace falta configurar nada.
// - `prueba` / `produccion`: `COBRE_USER_ID`, `COBRE_SECRET` y `COBRE_WEBHOOK_KEY` (la
//   `event_signature_key` de la suscripción), más `COBRE_BASE_URL` en prueba.
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
  type ModoCobre,
} from "./cobre.ts";
import { almacenSupabase, fetchSimulado, type AlmacenSim } from "./cobre-simulador.ts";

export type ConexionCobre = {
  modo: ModoCobre;
  cliente: CobreCliente;
  /** Solo en modo simulado. */
  almacen: AlmacenSim | null;
};

export function conexionCobre(sb: SupabaseClient): ConexionCobre {
  const modo = modoCobre();
  if (modo === "simulado") {
    const almacen = almacenSupabase(sb);
    return {
      modo,
      almacen,
      cliente: new CobreCliente({
        baseUrl: baseUrlCobre(modo),
        credenciales: { userId: "simulador", secret: "simulador" },
        fetch: fetchSimulado(almacen),
      }),
    };
  }
  const cred = credencialesCobre();
  if (!cred) throw new CobreError(500, "Faltan COBRE_USER_ID o COBRE_SECRET en los secretos");
  return {
    modo,
    almacen: null,
    cliente: new CobreCliente({ baseUrl: baseUrlCobre(modo), credenciales: cred }),
  };
}

/** Clave para verificar (y, en el simulador, firmar) los webhooks; null si falta. */
export async function claveWebhookCobre(modo: ModoCobre = modoCobre()): Promise<string | null> {
  if (modo !== "simulado") return Deno.env.get("COBRE_WEBHOOK_KEY") ?? null;
  const base = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return base ? await firmarCobre(base, "cobre-simulador", "webhooks") : null;
}

/** URL pública de `cobre-webhook` en este proyecto. */
export function urlWebhookCobre(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/cobre-webhook`;
}
