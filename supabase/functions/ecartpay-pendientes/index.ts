// Edge Function PÚBLICA (desplegar con --no-verify-jwt), Fase 5.
//
// - Sin body: reconsulta en Ecart Pay los pagos `creado`/`pendiente` con orden (de entre 2
//   minutos y 7 días de antigüedad), por si se perdió un aviso. La dispara pg_cron cada 5
//   minutos. No recibe datos ni devuelve información sensible, y corre como máximo una vez cada
//   4 minutos (`reservar_tarea`), así que no hace falta un secreto para llamarla.
// - { evento_id }: reprocesa un aviso de `webhook_eventos` (botón "Reprocesar"; solo admins).

import { esAdmin, HttpError, handler, json, readJson, serviceClient } from "../_shared/http.ts";
import { confirmarPago, procesarEvento } from "../_shared/pagos.ts";

const LOTE = 25;

Deno.serve(
  handler(async (req) => {
    const body =
      req.headers.get("content-length") === "0"
        ? {}
        : await readJson<{ evento_id?: string }>(req).catch(() => ({}));
    const sb = serviceClient();

    if (body.evento_id) {
      if (!(await esAdmin(req))) throw new HttpError(403, "Solo para administradores");
      const { data: ev, error } = await sb
        .from("webhook_eventos")
        .select("id, id_externo, firma_valida")
        .eq("id", body.evento_id)
        .maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!ev) throw new HttpError(404, "Evento inexistente");
      if (ev.firma_valida === false) throw new HttpError(409, "El aviso tiene la firma inválida");
      await procesarEvento(sb, ev.id, ev.id_externo);
      return json({ ok: true });
    }

    const { data: libre, error: errTarea } = await sb.rpc("reservar_tarea", {
      p_nombre: "ecartpay-pendientes",
      p_intervalo: "4 minutes",
    });
    if (errTarea) throw new HttpError(500, errTarea.message);
    if (!libre) return json({ ok: true, omitida: "corrió hace menos de 4 minutos" });

    const ahora = Date.now();
    const { data: pagos, error } = await sb
      .from("pagos")
      .select("id")
      .eq("proveedor", "ecartpay")
      .in("estado", ["creado", "pendiente"])
      .not("proveedor_orden_id", "is", null)
      .lt("created_at", new Date(ahora - 2 * 60_000).toISOString())
      .gt("created_at", new Date(ahora - 7 * 86_400_000).toISOString())
      .order("updated_at")
      .limit(LOTE);
    if (error) throw new HttpError(500, error.message);

    const resumen: Record<string, number> = {};
    for (const p of pagos ?? []) {
      let clave: string;
      try {
        clave = (await confirmarPago(sb, p.id)).estado;
      } catch {
        clave = "error";
      }
      resumen[clave] = (resumen[clave] ?? 0) + 1;
    }
    const resultado = { revisados: pagos?.length ?? 0, ...resumen };
    await sb.from("tareas_programadas").update({ resultado }).eq("nombre", "ecartpay-pendientes");
    return json({ ok: true, ...resultado });
  }),
);
