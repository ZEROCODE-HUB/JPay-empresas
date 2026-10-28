// Edge Function PÚBLICA (desplegar con --no-verify-jwt): avisos de Cobre (Fase C1).
//
// Cobre firma cada aviso: `event-timestamp` y `event-signature` = HMAC-SHA256 (hex) de
// "timestamp.cuerpo crudo" con la `event_signature_key` de la suscripción. Sin firma válida →
// 401 y queda registrado como rechazado. Todo aviso queda en `webhook_eventos`
// (proveedor `cobre`); el mismo `id` de evento se procesa una sola vez.
//
// Procesamiento (se suma en las fases siguientes): depósitos (`accounts.balance.credit` con
// `spei_credit`) y estados de transferencias (`money_movements.status.*`). En C1 solo se
// registran.

import { leerEventoCobre, verificarFirmaCobre } from "../_shared/cobre.ts";
import { claveWebhookCobre } from "../_shared/cobre-servidor.ts";
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

  const clave = await claveWebhookCobre();
  const firmaValida = clave
    ? await verificarFirmaCobre({
        clave,
        timestamp: req.headers.get("event-timestamp"),
        firma: req.headers.get("event-signature"),
        cuerpo: texto,
      })
    : false;

  const { id, evento, contenido } = leerEventoCobre(cuerpo);
  const estado = (contenido.status as { state?: unknown } | undefined)?.state;
  const sb = serviceClient();
  const { data: fila, error } = await sb
    .from("webhook_eventos")
    .insert({
      proveedor: "cobre",
      origen: "webhook",
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
  if (error) {
    if (error.code === "23505") return json({ ok: true, duplicado: true });
    return json({ error: "No se pudo registrar el aviso" }, 500);
  }

  if (!firmaValida) {
    await sb
      .from("webhook_eventos")
      .update({
        resultado: "rechazado",
        error: clave ? "Firma inválida" : "Falta COBRE_WEBHOOK_KEY",
        procesado_at: new Date().toISOString(),
      })
      .eq("id", fila.id);
    return json({ error: "Firma inválida" }, 401);
  }

  await sb
    .from("webhook_eventos")
    .update({ resultado: "registrado", procesado_at: new Date().toISOString(), intentos: 1 })
    .eq("id", fila.id);
  return json({ ok: true });
});
