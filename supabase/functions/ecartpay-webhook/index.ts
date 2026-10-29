// Edge Function PÚBLICA (desplegar con --no-verify-jwt): avisos de Ecart Pay (Fase 5).
//
// Llegan dos tipos de aviso a esta URL:
// - Webhooks de la cuenta (panel de Ecart Pay): traen x-pay-timestamp, x-pay-webhook-id y
//   x-pay-signature (HMAC-SHA256 con ECARTPAY_WEBHOOK_SECRET). Firma inválida → 401.
// - `notify_url` de cada orden (la ponemos al crearla): Ecart Pay manda el id de la orden; puede
//   venir sin firma (las órdenes de los comercios son de sus cuentas, no de la nuestra).
//
// Seguridad: un aviso NUNCA cambia un estado por su contenido. Solo dispara la consulta de la
// orden a Ecart Pay (confirmarPago), así que un aviso falso o repetido no puede marcar nada como
// pagado. Todo queda en `webhook_eventos`; el mismo webhook firmado se procesa una sola vez.
// Responde rápido (el proveedor espera < 5 s); si la consulta falla queda para la tarea de
// pendientes y para "Reprocesar" en el admin.

import { leerEventoWebhook, verificarFirmaWebhook } from "../_shared/ecartpay.ts";
import { json, serviceClient } from "../_shared/http.ts";
import { procesarEvento } from "../_shared/pagos.ts";

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
  const timestamp = req.headers.get("x-pay-timestamp");
  const webhookId = req.headers.get("x-pay-webhook-id");
  const firma = req.headers.get("x-pay-signature");
  const firmado = !!(timestamp && webhookId && firma);

  let firmaValida: boolean | null = null;
  if (firmado) {
    const secreto = Deno.env.get("ECARTPAY_WEBHOOK_SECRET");
    firmaValida = secreto
      ? await verificarFirmaWebhook({
          secreto,
          timestamp: timestamp!,
          webhookId: webhookId!,
          firma: firma!,
          cuerpo,
        })
      : false;
  }

  const { evento, idExterno, estado } = leerEventoWebhook(cuerpo);

  // Avisos sin firma (notify_url): cualquiera puede mandarlos. Solo se registran si la orden es de
  // un pago de JPay todavía abierto y no hubo otro aviso igual en el último minuto; se guarda un
  // resumen, no el cuerpo (la verdad sale de consultar la orden).
  if (!firmado) {
    if (!idExterno) return json({ ok: true, ignorado: "sin orden" });
    const { data: pago } = await sb
      .from("pagos")
      .select("id, estado")
      .eq("proveedor", "ecartpay")
      .eq("proveedor_orden_id", idExterno)
      .maybeSingle();
    if (!pago || !["creado", "pendiente"].includes(pago.estado)) {
      return json({ ok: true, ignorado: "orden desconocida o ya cerrada" });
    }
    const { count } = await sb
      .from("webhook_eventos")
      .select("id", { count: "exact", head: true })
      .eq("proveedor", "ecartpay")
      .eq("origen", "notify_url")
      .eq("id_externo", idExterno)
      .gt("recibido_at", new Date(Date.now() - 60_000).toISOString());
    if ((count ?? 0) > 0) return json({ ok: true, duplicado: true });
  }

  const { data: fila, error } = await sb
    .from("webhook_eventos")
    .insert({
      proveedor: "ecartpay",
      origen: firmado ? "webhook" : "notify_url",
      webhook_id: webhookId,
      evento,
      id_externo: idExterno,
      estado_externo: estado,
      firma_valida: firmaValida,
      payload: firmado ? (cuerpo ?? {}) : { evento, id_externo: idExterno, estado },
    })
    .select("id")
    .single();
  if (error) {
    // Mismo webhook firmado ya recibido: idempotente.
    if (error.code === "23505") return json({ ok: true, duplicado: true });
    return json({ error: "No se pudo registrar el aviso" }, 500);
  }

  if (firmado && !firmaValida) {
    await sb
      .from("webhook_eventos")
      .update({
        resultado: "rechazado",
        error: "Firma inválida",
        procesado_at: new Date().toISOString(),
      })
      .eq("id", fila.id);
    return json({ error: "Firma inválida" }, 401);
  }

  await procesarEvento(sb, fila.id, idExterno);
  return json({ ok: true });
});
