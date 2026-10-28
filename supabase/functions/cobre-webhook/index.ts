// Edge Function PÚBLICA (desplegar con --no-verify-jwt): avisos de Cobre (Fase C1).
//
// Cobre firma cada aviso: `event-timestamp` y `event-signature` = HMAC-SHA256 (hex) de
// "timestamp.cuerpo crudo" con la `event_signature_key` de la suscripción. Sin firma válida →
// 401 y queda registrado como rechazado. Todo aviso queda en `webhook_eventos`
// (proveedor `cobre`); el mismo `id` de evento se procesa una sola vez.
//
// Procesamiento:
// - `accounts.balance.credit` con `spei_credit` → `cobre_registrar_deposito` (acredita en la
//   subcuenta dueña de la CLABE, idempotente por id de transacción; sin dueño → sin asignar).
// - `money_movements.status.*` → `aplicarEstadoTransferencia` (busca la transferencia por id
//   del money movement o por external_id = TXID; completed contabiliza, rechazos liberan).
// - El resto queda registrado.

import { depositoSpei, leerEventoCobre, modoCobre, verificarFirmaCobre } from "../_shared/cobre.ts";
import { claveWebhookCobre } from "../_shared/cobre-servidor.ts";
import { aplicarEstadoTransferencia } from "../_shared/cobre-transferencias.ts";
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
        error: clave ? "Firma inválida" : "Falta COBRE_WEBHOOK_KEY",
        procesado_at: new Date().toISOString(),
      })
      .eq("id", filaId);
    return json({ error: "Firma inválida" }, 401);
  }

  let resultado = "registrado";
  let errorProceso: string | null = null;
  const deposito = evento === "accounts.balance.credit" ? depositoSpei(contenido) : null;
  if (deposito) {
    const { data, error: e } = await sb.rpc("cobre_registrar_deposito", {
      p_modo: modoCobre(),
      p_transaccion_id: deposito.transaccionId,
      p_cuenta_externa_id: deposito.cuentaId ?? undefined,
      p_clabe: deposito.clabeDestino ?? undefined,
      p_monto: deposito.monto,
      p_remitente: deposito.remitente ?? undefined,
      p_remitente_cuenta: deposito.remitenteCuenta ?? undefined,
      p_remitente_id: deposito.remitenteId ?? undefined,
      p_clave_rastreo: deposito.claveRastreo ?? undefined,
      p_cep: deposito.cep ?? undefined,
      p_fecha: deposito.fecha ?? undefined,
    });
    if (e) errorProceso = e.message;
    else resultado = `deposito ${(data as { estado?: string } | null)?.estado ?? "?"}`;
  }

  if (evento?.startsWith("money_movements.status.")) {
    const mmId = typeof contenido.id === "string" ? contenido.id : "";
    const ext = typeof contenido.external_id === "string" ? contenido.external_id : "";
    const { data: t } = await sb
      .from("cobre_transferencias")
      .select("id, id_txn, estado, mm_id")
      .or(`mm_id.eq.${mmId.replace(/[^\w-]/g, "")},id_txn.eq.${ext.replace(/[^\w-]/g, "")}`)
      .limit(1)
      .maybeSingle();
    if (!t) resultado = "transferencia desconocida";
    else {
      try {
        const r = await aplicarEstadoTransferencia(sb, t, contenido);
        resultado = `transferencia ${r.estado}`;
      } catch (e) {
        errorProceso = (e as Error).message;
      }
    }
  }

  await sb
    .from("webhook_eventos")
    .update({
      resultado: errorProceso ? "error" : resultado,
      error: errorProceso,
      procesado_at: new Date().toISOString(),
      intentos,
    })
    .eq("id", filaId);
  // Con error se responde 500 para que Cobre reintente (el depósito es idempotente).
  return errorProceso ? json({ error: "No se pudo procesar el aviso" }, 500) : json({ ok: true });
});
