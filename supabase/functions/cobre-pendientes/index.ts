// Edge Function PÚBLICA (desplegar con --no-verify-jwt): revisión de pendientes de Cobre.
// pg_cron cada 5 min; se limita a una vuelta cada 4 min (reservar_tarea). No recibe datos.
//
// - Transferencias abiertas (enviando / pendiente / pendiente_aprobacion) sin novedad hace más
//   de 2 min: se consultan en Cobre (por id o, si nunca llegó la respuesta, por external_id =
//   TXID) y se aplica el estado. Una `enviando` que Cobre no conoce después de 30 min se da por
//   no enviada y se libera la reserva.
// - Devoluciones de depósitos en curso y verificaciones de cuenta: se consulta el resultado.
// Cubre avisos perdidos: un aviso nunca es la única forma de cerrar una transferencia.

import { resumirTransferencia } from "../_shared/cobre.ts";
import { conexionCobre } from "../_shared/cobre-servidor.ts";
import {
  aplicarEstadoDevolucion,
  aplicarEstadoTransferencia,
} from "../_shared/cobre-transferencias.ts";
import { handler, json, serviceClient } from "../_shared/http.ts";

Deno.serve(
  handler(async () => {
    const sb = serviceClient();
    const { data: toca } = await sb.rpc("reservar_tarea", {
      p_nombre: "cobre-pendientes",
      p_intervalo: "4 minutes",
    });
    if (toca !== true) return json({ omitido: true });

    const { cliente: cobre, modo } = conexionCobre(sb);
    const ahora = Date.now();
    const resumen = { revisadas: 0, cerradas: 0, liberadas: 0, verificaciones: 0, errores: 0 };

    const { data: abiertas } = await sb
      .from("cobre_transferencias")
      .select("id, id_txn, estado, mm_id, created_at")
      .eq("modo", modo)
      .in("estado", ["enviando", "pendiente", "pendiente_aprobacion"])
      .lt("updated_at", new Date(ahora - 2 * 60_000).toISOString())
      .order("updated_at")
      .limit(50);

    for (const t of abiertas ?? []) {
      resumen.revisadas++;
      try {
        let mm: unknown = null;
        if (t.mm_id) mm = await cobre.get(`/money_movements/${t.mm_id}`);
        else {
          const r = await cobre.get<{ contents?: unknown[] }>("/money_movements", {
            external_id: t.id_txn,
          });
          mm = r?.contents?.[0] ?? null;
        }
        if (mm) {
          const r = await aplicarEstadoTransferencia(sb, t, mm);
          if (r.cambio) resumen.cerradas++;
          if (!t.mm_id) {
            await sb
              .from("cobre_transferencias")
              .update({ mm_id: resumirTransferencia(mm).id })
              .eq("id", t.id);
          }
        } else if (t.estado === "enviando" && ahora - Date.parse(t.created_at) > 30 * 60_000) {
          await sb.rpc("cancelar_transferencia_bdc", {
            p_origin_id: t.id_txn,
            p_motivo: "Cobre no recibió la transferencia",
          });
          await sb
            .from("cobre_transferencias")
            .update({
              estado: "error_envio",
              motivo: "Cobre no recibió la transferencia; no se debitó",
              updated_at: new Date().toISOString(),
            })
            .eq("id", t.id);
          resumen.liberadas++;
        }
      } catch {
        resumen.errores++;
      }
    }

    const { data: devoluciones } = await sb
      .from("cobre_depositos")
      .select("id, devolucion_estado, devolucion_mm_id")
      .eq("modo", modo)
      .in("devolucion_estado", ["pendiente", "enviando"])
      .not("devolucion_mm_id", "is", null)
      .limit(50);
    for (const d of devoluciones ?? []) {
      try {
        const mm = await cobre.get(`/money_movements/${d.devolucion_mm_id}`);
        if ((await aplicarEstadoDevolucion(sb, d, mm)) !== d.devolucion_estado) resumen.cerradas++;
      } catch {
        resumen.errores++;
      }
    }

    const { data: verif } = await sb
      .from("cobre_contrapartes")
      .select("id, verificacion_externa_id")
      .eq("modo", modo)
      .eq("verificacion", "procesando")
      .limit(50);
    for (const v of verif ?? []) {
      try {
        const av = await cobre.get<{ verification_response?: string }>(
          `/account_verifications/${v.verificacion_externa_id}`,
        );
        const r = av?.verification_response;
        if (r === "matched" || r === "unmatched" || r === "unresolved") {
          await sb
            .from("cobre_contrapartes")
            .update({ verificacion: r, verificado_at: new Date().toISOString() })
            .eq("id", v.id);
          resumen.verificaciones++;
        }
      } catch {
        resumen.errores++;
      }
    }

    await sb
      .from("tareas_programadas")
      .update({ resultado: resumen })
      .eq("nombre", "cobre-pendientes");
    return json(resumen);
  }),
);
