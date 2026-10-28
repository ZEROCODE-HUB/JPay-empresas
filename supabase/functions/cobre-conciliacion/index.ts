// Edge Function PÚBLICA (desplegar con --no-verify-jwt): conciliación diaria con Cobre (Fase C5).
// pg_cron 09:30 UTC; una vez cada 20 h. Con { manual: true } la corre un admin cuando quiera.
//
// Por cada Cobre Balance activo (de JPay o de clientes) trae las transacciones de los últimos
// 3 días y las cruza con JPay por identificadores (nunca por monto y hora):
// - `spei_credit` que JPay no tiene → se registra ya (`cobre_registrar_deposito`): un depósito
//   no depende de que llegue el aviso. Monto distinto → diferencia.
// - Débito de un envío (`money_movement_id`) que JPay no conoce → diferencia `falta_en_jpay`.
// - Transferencia completada en JPay sin débito en Cobre → `falta_en_proveedor`.
// - Saldo: suma de los Balances en Cobre contra BANCO_COBRE + depósitos sin asignar no
//   devueltos (comisiones o cargos de Cobre aparecen acá) → `saldo_distinto`. El ledger no
//   distingue modos: al pasar de simulado a prueba hay que limpiar los datos simulados.
// Las diferencias quedan en `conciliacion_proveedor_diferencias` (una abierta por caso).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { deCentavos, depositoSpei, type CobreCliente } from "../_shared/cobre.ts";
import { conexionCobre } from "../_shared/cobre-servidor.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

const DIAS = 3;
const MAX_PAGINAS = 20;
type Obj = Record<string, unknown>;
type Diferencia = { tipo: string; clave: string; transaccion: string | null; detalle: Obj };

Deno.serve(
  handler(async (req) => {
    const body = await readJson<{ manual?: boolean }>(req).catch(
      () => ({}) as { manual?: boolean },
    );
    const sb = serviceClient();
    const manual = body.manual === true;
    if (manual) {
      if (!(await esAdmin(req))) throw new HttpError(403, "Solo para administradores");
    } else {
      const { data: libre } = await sb.rpc("reservar_tarea", {
        p_nombre: "cobre-conciliacion",
        p_intervalo: "20 hours",
      });
      if (!libre) return json({ ok: true, omitida: "ya corrió en las últimas 20 horas" });
    }

    const { cliente: cobre, modo } = conexionCobre(sb);
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - DIAS * 86_400_000);
    const { data: corrida, error: e0 } = await sb
      .from("conciliaciones_proveedor")
      .insert({
        proveedor: "cobre",
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
        origen: manual ? "manual" : "programada",
      })
      .select("id")
      .single();
    if (e0) throw new HttpError(500, e0.message);

    const resumen = {
      modo,
      cuentas: 0,
      transacciones: 0,
      depositos_recuperados: 0,
      diferencias: 0,
      saldo_cobre: 0,
      saldo_jpay: 0,
      errores: [] as string[],
    };
    const diferencias: Diferencia[] = [];

    const { data: cuentas } = await sb
      .from("cobre_cuentas")
      .select("id, cuenta_externa_id")
      .eq("modo", modo)
      .eq("estado", "activa");

    const debitosDeEnvio = new Set<string>();
    for (const c of cuentas ?? []) {
      try {
        const cuenta = await cobre.get<{ obtained_balance?: number }>(
          `/accounts/${c.cuenta_externa_id}`,
          {
            balance: true,
          },
        );
        resumen.saldo_cobre += deCentavos(Number(cuenta?.obtained_balance ?? 0));
        const txs = await traerTransacciones(cobre, c.cuenta_externa_id, desde);
        resumen.cuentas++;
        resumen.transacciones += txs.length;
        for (const t of txs) {
          const r = await revisarTransaccion(sb, modo, t, debitosDeEnvio);
          if (r === "recuperado") resumen.depositos_recuperados++;
          else if (r) diferencias.push(r);
        }
      } catch (e) {
        resumen.errores.push(`${c.cuenta_externa_id}: ${(e as Error).message}`.slice(0, 300));
      }
    }

    // Transferencias completadas en JPay sin débito en Cobre (dentro de la ventana).
    if (!resumen.errores.length) {
      const { data: completadas } = await sb
        .from("cobre_transferencias")
        .select("id_txn, mm_id, monto")
        .eq("modo", modo)
        .eq("estado", "completada")
        // Creadas con margen dentro de la ventana: su débito tiene que estar en las transacciones.
        .gte("created_at", new Date(desde.getTime() + 3_600_000).toISOString());
      for (const t of completadas ?? []) {
        if (t.mm_id && !debitosDeEnvio.has(t.mm_id)) {
          diferencias.push({
            tipo: "falta_en_proveedor",
            clave: t.mm_id,
            transaccion: null,
            detalle: {
              txid: t.id_txn,
              monto: Number(t.monto),
              nota: "Completada en JPay sin débito en Cobre",
            },
          });
        }
      }
      // Saldo total: Balances de Cobre contra BANCO_COBRE + depósitos sin asignar no devueltos.
      resumen.saldo_jpay = await saldoJpay(sb, modo);
      if (Math.abs(resumen.saldo_cobre - resumen.saldo_jpay) >= 0.01) {
        diferencias.push({
          tipo: "saldo_distinto",
          clave: `saldo:${modo}`,
          transaccion: null,
          detalle: {
            saldo_cobre: resumen.saldo_cobre,
            saldo_jpay: resumen.saldo_jpay,
            diferencia: Math.round((resumen.saldo_cobre - resumen.saldo_jpay) * 100) / 100,
          },
        });
      }
    }

    for (const d of diferencias) {
      await sb.from("conciliacion_proveedor_diferencias").upsert(
        {
          conciliacion_id: corrida.id,
          tipo: d.tipo,
          orden_id: d.clave,
          transaccion_id: d.transaccion,
          detalle: d.detalle,
        },
        { ignoreDuplicates: true },
      );
    }
    resumen.diferencias = diferencias.length;
    await sb
      .from("conciliaciones_proveedor")
      .update({ resumen, error: resumen.errores.length ? resumen.errores.join(" | ") : null })
      .eq("id", corrida.id);
    return json({ ok: true, conciliacion_id: corrida.id, ...resumen });
  }),
);

async function traerTransacciones(
  cobre: CobreCliente,
  cuenta: string,
  desde: Date,
): Promise<Obj[]> {
  const todas: Obj[] = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const r = await cobre.get<{ contents?: Obj[]; is_last_page?: boolean }>(
      `/accounts/${cuenta}/transactions`,
      {
        date_gte: desde.toISOString(),
        page_size: 100,
        page_number: page,
      },
    );
    const items = Array.isArray(r?.contents) ? r.contents : [];
    todas.push(...items);
    if (r?.is_last_page !== false || items.length === 0) break;
  }
  return todas;
}

/** Cruza una transacción de Cobre con JPay: recupera depósitos y devuelve la diferencia, si hay. */
async function revisarTransaccion(
  sb: SupabaseClient,
  modo: string,
  t: Obj,
  debitosDeEnvio: Set<string>,
): Promise<Diferencia | "recuperado" | null> {
  const meta = (t.metadata ?? {}) as Obj;
  const id = String(t.id ?? "");
  const dep = depositoSpei(t);
  if (dep) {
    const { data: fila } = await sb
      .from("cobre_depositos")
      .select("monto")
      .eq("modo", modo)
      .eq("transaccion_externa_id", dep.transaccionId)
      .maybeSingle();
    if (!fila) {
      const { error } = await sb.rpc("cobre_registrar_deposito", {
        p_modo: modo,
        p_transaccion_id: dep.transaccionId,
        p_cuenta_externa_id: dep.cuentaId ?? undefined,
        p_clabe: dep.clabeDestino ?? undefined,
        p_monto: dep.monto,
        p_remitente: dep.remitente ?? undefined,
        p_remitente_cuenta: dep.remitenteCuenta ?? undefined,
        p_remitente_id: dep.remitenteId ?? undefined,
        p_clave_rastreo: dep.claveRastreo ?? undefined,
        p_cep: dep.cep ?? undefined,
        p_fecha: dep.fecha ?? undefined,
      });
      if (error) {
        return {
          tipo: "falta_en_jpay",
          clave: id,
          transaccion: id,
          detalle: { monto: dep.monto, error: error.message },
        };
      }
      return "recuperado";
    }
    if (Math.abs(Number(fila.monto) - dep.monto) >= 0.01) {
      return {
        tipo: "monto_distinto",
        clave: id,
        transaccion: id,
        detalle: { cobre: dep.monto, jpay: Number(fila.monto) },
      };
    }
    return null;
  }

  const mmId = typeof meta.money_movement_id === "string" ? meta.money_movement_id : null;
  if (!mmId) return null;
  if (t.type === "spei_rejected") return null; // reintegro de un rechazo: lo cierra el estado del envío
  debitosDeEnvio.add(mmId);
  const monto = deCentavos(Math.abs(Number(t.amount ?? 0)));
  const [{ data: envio }, { data: devolucion }] = await Promise.all([
    sb.from("cobre_transferencias").select("monto, estado").eq("mm_id", mmId).maybeSingle(),
    sb.from("cobre_depositos").select("monto").eq("devolucion_mm_id", mmId).maybeSingle(),
  ]);
  const propio = envio ?? devolucion;
  if (!propio) {
    return {
      tipo: "falta_en_jpay",
      clave: mmId,
      transaccion: id,
      detalle: { monto, tipo: t.type, nota: "Envío en Cobre que JPay no tiene" },
    };
  }
  if (Math.abs(Number(propio.monto) - monto) >= 0.01) {
    return {
      tipo: "monto_distinto",
      clave: mmId,
      transaccion: id,
      detalle: { cobre: monto, jpay: Number(propio.monto) },
    };
  }
  return null;
}

/** BANCO_COBRE (deudor) + depósitos sin asignar que siguen en Cobre. */
async function saldoJpay(sb: SupabaseClient, modo: string): Promise<number> {
  const { data: cuenta } = await sb
    .from("ledger_accounts")
    .select("id")
    .eq("account_code", "BANCO_COBRE")
    .single();
  let banco = 0;
  for (let desde = 0; ; desde += 1000) {
    const { data } = await sb
      .from("ledger_entries")
      .select("entry_type, amount")
      .eq("account_id", cuenta?.id ?? "")
      .range(desde, desde + 999);
    for (const e of data ?? []) banco += (e.entry_type === "debit" ? 1 : -1) * Number(e.amount);
    if (!data || data.length < 1000) break;
  }
  const { data: sinAsignar } = await sb
    .from("cobre_depositos")
    .select("monto")
    .eq("modo", modo)
    .eq("estado", "sin_asignar")
    // Con la devolución en curso el dinero ya salió (o está saliendo) de Cobre.
    .or("devolucion_estado.is.null,devolucion_estado.in.(rechazada,fallida,cancelada)");
  const pendiente = (sinAsignar ?? []).reduce((s, d) => s + Number(d.monto), 0);
  return Math.round((banco + pendiente) * 100) / 100;
}
