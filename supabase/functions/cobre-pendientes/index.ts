// Edge Function PÚBLICA (desplegar con --no-verify-jwt): revisión de pendientes de Cobre.
// pg_cron cada 5 min; se limita a una vuelta cada 4 min (reservar_tarea). No recibe datos.
// Es la red de seguridad de los avisos (Solution Design §5): nada se cierra solo por un aviso.
//
// - Envíos abiertos sin novedad hace más de 2 min: se consultan (por id o por external_id = TXID)
//   y se aplica el estado. Un `enviando` que Cobre no conoce después de 30 min se da por no
//   enviado y se libera la reserva. Envíos USD: traslado Global→USA y pago.
// - Lotes en curso, devoluciones de depósitos, verificaciones de titular (CLABE) y de
//   beneficiarios USD, altas de Subclientes (y su Balance), cobros R2P y conversiones.
// Cada fila se consulta en la instancia de su comercio (la propia o la matriz).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { estadoSubcliente, resumirTransferencia, verificacionUsd } from "../_shared/cobre.ts";
import { conexionDeCliente, type ConexionCobre } from "../_shared/cobre-servidor.ts";
import {
  aplicarEstadoDevolucion,
  aplicarEstadoTransferencia,
} from "../_shared/cobre-transferencias.ts";
import { aplicarEstadoLote } from "../_shared/cobre-lotes.ts";
import { aplicarEstadoSubcliente, crearBalanceComercio } from "../_shared/cobre-subclientes.ts";
import { aplicarEstadoCobroR2p, emitirCobroR2p } from "../_shared/cobre-r2p.ts";
import {
  aplicarEstadoCruce,
  aplicarEstadoEnvioUsd,
  ejecutarCruce,
  iniciarEnvioUsd,
} from "../_shared/cobre-usd.ts";
import { modoCobre } from "../_shared/cobre.ts";
import { handler, json, serviceClient } from "../_shared/http.ts";

type Obj = Record<string, unknown>;
const hace = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;

Deno.serve(
  handler(async () => {
    const sb = serviceClient();
    const { data: toca } = await sb.rpc("reservar_tarea", {
      p_nombre: "cobre-pendientes",
      p_intervalo: "4 minutes",
    });
    if (toca !== true) return json({ omitido: true });

    const modo = modoCobre();
    const conexiones = new Map<string, Promise<ConexionCobre>>();
    const conexion = (legajo: string) => {
      if (!conexiones.has(legajo)) conexiones.set(legajo, conexionDeCliente(sb, legajo));
      return conexiones.get(legajo)!;
    };
    const resumen = {
      revisadas: 0,
      cerradas: 0,
      liberadas: 0,
      lotes: 0,
      verificaciones: 0,
      subclientes: 0,
      cobros: 0,
      conversiones: 0,
      errores: [] as string[],
    };
    const intentar = async (que: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        resumen.errores.push(`${que}: ${(e as Error).message}`.slice(0, 200));
      }
    };

    // ── Envíos ──
    const { data: abiertas } = await sb
      .from("cobre_transferencias")
      .select("*")
      .eq("modo", modo)
      .in("estado", ["enviando", "pendiente", "trasladando"])
      .lt("updated_at", hace(2 * MIN))
      .order("updated_at")
      .limit(50);
    for (const t of (abiertas ?? []) as Obj[]) {
      resumen.revisadas++;
      await intentar(String(t.id_txn), async () => {
        const c = await conexion(String(t.cliente_legajo));
        if (t.moneda === "USD" && (t.estado === "trasladando" || t.estado === "enviando")) {
          if (t.traslado_mm_id) {
            await aplicarEstadoEnvioUsd(
              sb,
              c,
              await c.cliente.get(`/money_movements/${t.traslado_mm_id}`),
            );
          } else {
            await iniciarEnvioUsd(
              sb,
              c,
              t as Obj & { id: string; id_txn: string; estado: string; mm_id: null },
            );
          }
          return;
        }
        let mm: unknown = null;
        if (t.mm_id) mm = await c.cliente.get(`/money_movements/${t.mm_id}`);
        else {
          const r = await c.cliente.get<{ contents?: unknown[] }>("/money_movements", {
            external_id: String(t.id_txn),
          });
          mm = r?.contents?.[0] ?? null;
        }
        if (mm) {
          const fila = {
            id: String(t.id),
            id_txn: String(t.id_txn),
            estado: String(t.estado),
            mm_id: (t.mm_id as string | null) ?? null,
          };
          if (t.moneda === "USD") await aplicarEstadoEnvioUsd(sb, c, mm);
          else if ((await aplicarEstadoTransferencia(sb, fila, mm)).cambio) resumen.cerradas++;
          if (!t.mm_id) {
            await sb
              .from("cobre_transferencias")
              .update({ mm_id: resumirTransferencia(mm).id })
              .eq("id", t.id);
          }
        } else if (
          t.estado === "enviando" &&
          Date.now() - Date.parse(String(t.created_at)) > 30 * MIN
        ) {
          await sb.rpc("cancelar_transferencia_bdc", {
            p_origin_id: t.id_txn,
            p_motivo: "Cobre no recibió la transferencia",
          });
          await sb
            .from("cobre_transferencias")
            .update({
              estado: t.lote_id ? "fallida" : "error_envio",
              motivo: "Cobre no recibió la transferencia; no se debitó",
              updated_at: new Date().toISOString(),
            })
            .eq("id", t.id);
          resumen.liberadas++;
        }
      });
    }

    // ── Lotes ──
    const { data: lotes } = await sb
      .from("cobre_lotes")
      .select("id, cliente_legajo, lote_externo_id")
      .eq("modo", modo)
      .in("estado", ["validating", "processing"])
      .not("lote_externo_id", "is", null)
      .lt("updated_at", hace(3 * MIN))
      .limit(20);
    for (const l of (lotes ?? []) as Obj[]) {
      await intentar(`lote ${l.id}`, async () => {
        const c = await conexion(String(l.cliente_legajo));
        await aplicarEstadoLote(
          sb,
          await c.cliente.get(`/bulk_money_movements/${l.lote_externo_id}`),
        );
        resumen.lotes++;
      });
    }

    // ── Devoluciones de depósitos ──
    const { data: devoluciones } = await sb
      .from("cobre_depositos")
      .select("id, devolucion_estado, devolucion_mm_id, cliente_legajo, cuenta_externa_id")
      .eq("modo", modo)
      .in("devolucion_estado", ["pendiente", "enviando"])
      .not("devolucion_mm_id", "is", null)
      .limit(50);
    for (const d of (devoluciones ?? []) as Obj[]) {
      await intentar(`devolución ${d.id}`, async () => {
        const c = await conexionDeLaCuenta(sb, conexion, d);
        const mm = await c.cliente.get(`/money_movements/${d.devolucion_mm_id}`);
        const fila = {
          id: String(d.id),
          devolucion_estado: (d.devolucion_estado as string | null) ?? null,
        };
        if ((await aplicarEstadoDevolucion(sb, fila, mm)) !== d.devolucion_estado)
          resumen.cerradas++;
      });
    }

    // ── Verificaciones (titular de CLABE y beneficiarios USD) ──
    const { data: verif } = await sb
      .from("cobre_contrapartes")
      .select("id, tipo, cliente_legajo, verificacion_externa_id, contraparte_externa_id")
      .eq("modo", modo)
      .eq("verificacion", "procesando")
      .limit(50);
    for (const v of (verif ?? []) as Obj[]) {
      await intentar(`verificación ${v.id}`, async () => {
        const c = await conexion(String(v.cliente_legajo));
        let r: string | null = null;
        let motivo: string | null = null;
        if (v.tipo === "business") {
          const cp = await c.cliente.get<Obj>(`/counterparties/${v.contraparte_externa_id}`);
          r = verificacionUsd(cp);
          const desc = ((cp.metadata ?? {}) as Obj).counterparty_verification_description;
          motivo = typeof desc === "string" && desc ? desc : null;
          if (r === "procesando") return;
        } else if (v.verificacion_externa_id) {
          const av = await c.cliente.get<Obj>(
            `/account_verifications/${v.verificacion_externa_id}`,
          );
          const resp = av?.verification_response;
          const x =
            typeof resp === "string" ? resp : (resp as Obj | undefined)?.verification_result;
          if (x !== "matched" && x !== "unmatched" && x !== "unresolved") return;
          r = x;
        } else return;
        await sb
          .from("cobre_contrapartes")
          .update({
            verificacion: r,
            verificacion_motivo: motivo,
            verificado_at: new Date().toISOString(),
          })
          .eq("id", v.id);
        resumen.verificaciones++;
      });
    }

    // ── Subclientes: KYB en curso, envíos sin respuesta y aprobados sin Balance ──
    const { data: subs } = await sb
      .from("cobre_subclientes")
      .select("*")
      .eq("modo", modo)
      .in("estado", ["enviando", "processing", "approved"])
      .lt("updated_at", hace(3 * MIN))
      .limit(30);
    for (const s of (subs ?? []) as Obj[]) {
      await intentar(`subcliente ${s.cliente_legajo}`, async () => {
        const c = await conexion(String(s.cliente_legajo));
        if (s.estado === "enviando") {
          // Sin respuesta al alta: se reenvía con la misma Idempotency-Key (nunca duplica).
          const sc = await c.cliente.post<Obj>("/subclients", s.datos_enviados, undefined, {
            "Idempotency-Key": String(s.idempotency_key),
          });
          const id = estadoSubcliente(sc).id;
          if (id) {
            await sb
              .from("cobre_subclientes")
              .update({
                subcliente_externo_id: id,
                estado: "processing",
                updated_at: new Date().toISOString(),
              })
              .eq("id", s.id);
            await aplicarEstadoSubcliente(sb, c, sc);
          }
        } else if (s.estado === "processing") {
          await aplicarEstadoSubcliente(
            sb,
            c,
            await c.cliente.get(`/subclients/${s.subcliente_externo_id}`),
          );
        } else {
          const { data: cuenta } = await sb
            .from("cobre_cuentas")
            .select("id")
            .eq("tipo", "cliente")
            .eq("cliente_legajo", s.cliente_legajo)
            .eq("modo", modo)
            .eq("estado", "activa")
            .maybeSingle();
          if (cuenta) return;
          await crearBalanceComercio(
            sb,
            c,
            s as Obj & {
              id: string;
              cliente_legajo: string;
              modo: string;
              subcliente_externo_id: string | null;
              estado: string;
              balance_pedido_at: string | null;
            },
          );
        }
        resumen.subclientes++;
      });
    }

    // ── Cobros R2P: sin emitir (sin respuesta) o sin novedad ──
    const { data: cobros } = await sb
      .from("cobre_cobros_r2p")
      .select("*")
      .eq("modo", modo)
      .in("estado", ["creando", "pendiente"])
      .lt("updated_at", hace(3 * MIN))
      .limit(50);
    for (const r of (cobros ?? []) as Obj[]) {
      await intentar(`cobro ${r.external_id}`, async () => {
        const c = await conexion(String(r.cliente_legajo));
        if (r.estado === "creando") {
          await emitirCobroR2p(
            sb,
            c,
            r as Obj & { id: string; external_id: string; estado: string },
          );
        } else if (r.mm_id) {
          await aplicarEstadoCobroR2p(
            sb,
            c.modo,
            await c.cliente.get(`/money_movements/${r.mm_id}`),
          );
        }
        resumen.cobros++;
      });
    }

    // ── Conversiones en curso ──
    const { data: cruces } = await sb
      .from("cobre_cruces")
      .select("*")
      .eq("modo", modo)
      .in("estado", ["enviando", "initiated", "processing"])
      .lt("updated_at", hace(2 * MIN))
      .limit(30);
    for (const x of (cruces ?? []) as Obj[]) {
      await intentar(`conversión ${x.external_id}`, async () => {
        const c = await conexion(String(x.cliente_legajo));
        if (x.estado === "enviando" || !x.mm_id) await ejecutarCruce(sb, c, x);
        else
          await aplicarEstadoCruce(
            sb,
            c,
            await c.cliente.get(`/cross_border_money_movements/${x.mm_id}`),
            null,
          );
        resumen.conversiones++;
      });
    }

    await sb
      .from("tareas_programadas")
      .update({ resultado: resumen })
      .eq("nombre", "cobre-pendientes");
    return json(resumen);
  }),
);

/** Conexión para una fila que solo conoce el Balance: la instancia del comercio dueño del Balance. */
async function conexionDeLaCuenta(
  sb: SupabaseClient,
  conexion: (legajo: string) => Promise<ConexionCobre>,
  d: Obj,
): Promise<ConexionCobre> {
  if (typeof d.cliente_legajo === "string" && d.cliente_legajo)
    return await conexion(d.cliente_legajo);
  const { data } = await sb
    .from("cobre_cuentas")
    .select("cliente_legajo")
    .eq("cuenta_externa_id", String(d.cuenta_externa_id ?? ""))
    .maybeSingle();
  return await conexion(data?.cliente_legajo ?? "");
}
