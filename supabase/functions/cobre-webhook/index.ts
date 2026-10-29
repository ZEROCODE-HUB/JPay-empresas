// Edge Function PÚBLICA (desplegar con --no-verify-jwt): avisos de Cobre.
//
// Cobre firma cada aviso: `event-timestamp` y `event-signature` = HMAC-SHA256 (hex) de
// "timestamp.cuerpo crudo" con la `event_signature_key` de la suscripción. Sin firma válida (o
// con un timestamp de más de 15 min) → 401 y queda registrado como rechazado. Todo aviso queda
// en `webhook_eventos` (proveedor `cobre`); el mismo `id` de evento se procesa una sola vez.
//
// Instancias: la matriz de JPay avisa a esta URL; un comercio con instancia Cobre propia avisa a
// `?instancia=<id>` y se verifica con la clave de esa instancia (nunca se mezclan).
//
// El procesamiento está en `_shared/cobre-procesos.ts` (depósitos, cobros R2P, envíos, rebotes,
// lotes, Subclientes, conversiones y envíos USD). Con error se responde 500: Cobre reintenta solo
// errores de conexión, así que lo que falle lo recupera la revisión de pendientes o la conciliación.

import { leerEventoCobre, modoCobre, verificarFirmaCobre } from "../_shared/cobre.ts";
import {
  claveWebhookCobre,
  conexionCobre,
  instanciaCobre,
  type InstanciaCobre,
} from "../_shared/cobre-servidor.ts";
import { procesarEventoCobre } from "../_shared/cobre-procesos.ts";
import { json, serviceClient } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const texto = await req.text();
  if (texto.length > 256_000) return json({ error: "Aviso demasiado grande" }, 413);
  let cuerpo: unknown;
  try {
    cuerpo = texto ? JSON.parse(texto) : {};
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  const sb = serviceClient();
  const instanciaId = new URL(req.url).searchParams.get("instancia");
  let instancia: InstanciaCobre | null = null;
  if (instanciaId) {
    if (!/^[0-9a-f-]{36}$/i.test(instanciaId)) return json({ error: "Instancia inválida" }, 400);
    instancia = await instanciaCobre(sb, instanciaId).catch(() => null);
    if (!instancia) return json({ error: "Instancia desconocida" }, 404);
  }

  const clave = await claveWebhookCobre(modoCobre(), instancia);
  const firmaValida = clave
    ? await verificarFirmaCobre({
        clave,
        timestamp: req.headers.get("event-timestamp"),
        firma: req.headers.get("event-signature"),
        cuerpo: texto,
      })
    : false;

  const { id, evento, contenido } = leerEventoCobre(cuerpo);
  const estado = (contenido.status as { state?: unknown } | undefined)?.state ?? contenido.status;
  const { data: fila, error } = await sb
    .from("webhook_eventos")
    .insert({
      proveedor: "cobre",
      origen: "webhook",
      instancia_id: instancia?.id ?? null,
      webhook_id: id,
      evento,
      id_externo: typeof contenido.id === "string" ? contenido.id : null,
      estado_externo:
        typeof estado === "string" ? estado : ((contenido.type as string | undefined) ?? null),
      firma_valida: firmaValida,
      payload: cuerpo ?? {},
    })
    .select("id")
    .single();
  let filaId = fila?.id as string | undefined;
  let intentos = 1;
  if (error) {
    if (error.code !== "23505") return json({ error: "No se pudo registrar el aviso" }, 500);
    // Mismo evento firmado ya recibido: se reprocesa solo si el intento anterior falló.
    const { data: previo } = await sb
      .from("webhook_eventos")
      .select("id, resultado, intentos")
      .eq("proveedor", "cobre")
      .eq("webhook_id", id)
      .eq("firma_valida", true)
      .maybeSingle();
    if (!previo || previo.resultado !== "error") return json({ ok: true, duplicado: true });
    filaId = previo.id;
    intentos = (previo.intentos ?? 0) + 1;
  }

  if (!firmaValida) {
    await sb
      .from("webhook_eventos")
      .update({
        resultado: "rechazado",
        error: clave ? "Firma inválida o vencida" : "Falta la clave de avisos de la instancia",
        procesado_at: new Date().toISOString(),
      })
      .eq("id", filaId);
    return json({ error: "Firma inválida" }, 401);
  }

  let resultado = "registrado";
  let errorProceso: string | null = null;
  try {
    resultado = await procesarEventoCobre(sb, conexionCobre(sb, instancia), evento, contenido);
  } catch (e) {
    errorProceso = (e as Error).message;
  }

  await sb
    .from("webhook_eventos")
    .update({
      resultado: errorProceso ? "error" : resultado.slice(0, 200),
      error: errorProceso,
      procesado_at: new Date().toISOString(),
      intentos,
    })
    .eq("id", filaId);
  return errorProceso ? json({ error: "No se pudo procesar el aviso" }, 500) : json({ ok: true });
});
