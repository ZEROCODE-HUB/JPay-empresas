// Edge Function PÚBLICA (desplegar con --no-verify-jwt): motor del simulador de Cobre.
// Solo actúa con `COBRE_MODO` = simulado (en prueba/producción responde `omitido`).
//
// - Sin body (pg_cron, cada minuto): hace avanzar transferencias y verificaciones y envía los
//   avisos en cola, firmados, a `cobre-webhook` (como haría Cobre). Una vez cada 50 s.
// - Con `accion` (solo admins): `deposito` { clabe, monto, remitente?, concepto? } simula una
//   transferencia SPEI entrante; `aprobar` / `cancelar` { mm } decide una transferencia en
//   `pending_approval`; `avanzar` fuerza una vuelta ya.

import { firmarCobre, modoCobre } from "../_shared/cobre.ts";
import {
  almacenSupabase,
  avanzarSimulador,
  decidirAprobacionSimulada,
  depositoSimulado,
  eventosPendientes,
  marcarEventoEnviado,
  type AlmacenSim,
} from "../_shared/cobre-simulador.ts";
import { claveWebhookCobre, urlWebhookCobre } from "../_shared/cobre-servidor.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

type Body = {
  accion?: unknown;
  clabe?: unknown;
  monto?: unknown;
  remitente?: unknown;
  concepto?: unknown;
  mm?: unknown;
};

Deno.serve(
  handler(async (req) => {
    if (modoCobre() !== "simulado")
      return json({ omitido: true, motivo: "COBRE_MODO no es simulado" });
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    const almacen = almacenSupabase(sb);

    if (body.accion !== undefined) {
      if (!(await esAdmin(req))) throw new HttpError(403, "Solo para administradores");
      switch (body.accion) {
        case "deposito": {
          const monto = Number(body.monto);
          if (typeof body.clabe !== "string" || !/^\d{18}$/.test(body.clabe))
            throw new HttpError(400, "CLABE inválida");
          if (!(monto > 0) || monto > 10_000_000) throw new HttpError(400, "Monto inválido");
          let trx;
          try {
            trx = await depositoSimulado(almacen, {
              clabe: body.clabe,
              monto,
              remitente:
                typeof body.remitente === "string" ? body.remitente.slice(0, 60) : undefined,
              concepto: typeof body.concepto === "string" ? body.concepto.slice(0, 40) : undefined,
            });
          } catch (e) {
            throw new HttpError(422, (e as Error).message);
          }
          return json({ transaccion: trx, ...(await vuelta(almacen)) });
        }
        case "aprobar":
        case "cancelar": {
          if (typeof body.mm !== "string") throw new HttpError(400, "Falta la transferencia");
          const mm = await decidirAprobacionSimulada(almacen, body.mm, body.accion === "aprobar");
          if (!mm) throw new HttpError(409, "La transferencia no está pendiente de aprobación");
          return json({ movimiento: mm, ...(await vuelta(almacen)) });
        }
        case "avanzar":
          return json(await vuelta(almacen));
        default:
          throw new HttpError(400, "Acción inválida");
      }
    }

    const { data: toca } = await sb.rpc("reservar_tarea", {
      p_nombre: "cobre-simulador",
      p_intervalo: "50 seconds",
    });
    if (toca !== true) return json({ omitido: true, motivo: "Corrió hace menos de 50 s" });
    return json(await vuelta(almacen));
  }),
);

/** Avanza el simulador y envía los avisos en cola, firmados, a `cobre-webhook`. */
async function vuelta(almacen: AlmacenSim) {
  await avanzarSimulador(almacen, Date.now());
  const clave = await claveWebhookCobre("simulado");
  if (!clave) throw new HttpError(500, "No se pudo derivar la clave de los webhooks simulados");
  let enviados = 0;
  let fallidos = 0;
  for (const e of await eventosPendientes(almacen)) {
    const cuerpo = JSON.stringify(e.cuerpo);
    const timestamp = new Date().toISOString();
    try {
      const res = await fetch(urlWebhookCobre(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "event-timestamp": timestamp,
          "event-signature": await firmarCobre(clave, timestamp, cuerpo),
        },
        body: cuerpo,
      });
      await res.body?.cancel();
      // Como Cobre, se reintenta en la próxima vuelta si el webhook no respondió 2xx.
      if (res.ok) {
        await marcarEventoEnviado(almacen, e, `HTTP ${res.status}`);
        enviados++;
      } else fallidos++;
    } catch {
      fallidos++;
    }
  }
  return { enviados, fallidos };
}
