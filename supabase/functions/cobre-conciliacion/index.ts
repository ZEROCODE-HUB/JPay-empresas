// Edge Function PÚBLICA (desplegar con --no-verify-jwt): conciliación diaria con Cobre
// (Solution Design §6). pg_cron 09:30 UTC; una vez cada 20 h. Con { manual: true } la corre un
// admin cuando quiera.
//
// Por cada instancia (la matriz de JPay y las instancias propias de comercios) y cada Cobre
// Balance activo, trae las transacciones de los últimos 3 días y las cruza con JPay por
// identificadores (`money_movement_id`, `mm_external_id`), nunca por monto y hora:
// - `spei_credit` / `r2p_spei_credit` que JPay no tiene → se acreditan ya (un depósito o un cobro
//   no dependen de que llegue el aviso).
// - `spei_rejected` de un envío ya completado → se reintegra (rebote).
// - Débitos de envíos (`spei_debit`, `fedwire_debit`, `swift_debit`), de conversiones
//   (`cbmm_debit`/`cbmm_credit`) y traslados (`global_pay_to_usa_*`) que JPay no conoce →
//   `falta_en_jpay`; montos distintos → `monto_distinto`.
// - Envío completado en JPay sin débito en Cobre → `falta_en_proveedor`.
// - Saldo por Balance: el de cada comercio contra `cobre_saldo_esperado_comercio` (lo que JPay le
//   debe + comisiones aún en el Balance − envíos debitados sin cerrar); Global + USA contra
//   BANCO_COBRE_USD → `saldo_distinto`.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { deCentavos, depositoSpei, transaccionCobre, type CobreCliente } from "../_shared/cobre.ts";
import { conexionCobre, instanciaCobre, type ConexionCobre } from "../_shared/cobre-servidor.ts";
import { acreditarCobroR2p } from "../_shared/cobre-r2p.ts";
import { aplicarRebote } from "../_shared/cobre-transferencias.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

const DIAS = 3;
const MAX_PAGINAS = 20;
type Obj = Record<string, unknown>;
type Diferencia = { tipo: string; clave: string; transaccion: string | null; detalle: Obj };
type Cuenta = {
  id: string;
  tipo: string;
  cliente_legajo: string | null;
  cuenta_externa_id: string;
  moneda: string;
};

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

    const matriz = conexionCobre(sb);
    const modo = matriz.modo;
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
      instancias: 0,
      cuentas: 0,
      transacciones: 0,
      recuperados: 0,
      diferencias: 0,
      saldos: [] as Obj[],
      errores: [] as string[],
    };
    const diferencias: Diferencia[] = [];

    // Instancias: la matriz (instancia_id null) y las propias de comercios.
    const { data: insts } = await sb
      .from("cobre_instancias")
      .select("id")
      .eq("modo", modo)
      .eq("estado", "activa");
    const conexiones: ConexionCobre[] = [matriz];
    for (const i of (insts ?? []) as { id: string }[]) {
      try {
        const inst = await instanciaCobre(sb, i.id);
        if (inst) conexiones.push(conexionCobre(sb, inst));
      } catch (e) {
        resumen.errores.push(`instancia ${i.id}: ${(e as Error).message}`);
      }
    }

    const vistos = new Set<string>(); // money movements con débito en Cobre
    const enCurso = new Map<string, number>(); // por Balance: envíos debitados que JPay no cerró
    for (const c of conexiones) {
      resumen.instancias++;
      let q = sb
        .from("cobre_cuentas")
        .select("id, tipo, cliente_legajo, cuenta_externa_id, moneda")
        .eq("modo", modo)
        .eq("estado", "activa")
        .in("tipo", ["cliente", "global", "usa"]);
      q = c.instanciaId ? q.eq("instancia_id", c.instanciaId) : q.is("instancia_id", null);
      const { data: cuentas } = await q;
      const saldosUsd: number[] = [];
      for (const cuenta of (cuentas ?? []) as Cuenta[]) {
        try {
          const info = await c.cliente.get<{ obtained_balance?: number }>(
            `/accounts/${cuenta.cuenta_externa_id}`,
            { balance: true },
          );
          const saldoCobre = deCentavos(Number(info?.obtained_balance ?? 0));
          const txs = await traerTransacciones(c.cliente, cuenta.cuenta_externa_id, desde);
          resumen.cuentas++;
          resumen.transacciones += txs.length;
          for (const t of txs) {
            const r = await revisarTransaccion(sb, c, cuenta, t, vistos, enCurso);
            if (r === "recuperado") resumen.recuperados++;
            else if (r) diferencias.push(r);
          }
          if (cuenta.tipo === "cliente") {
            const { data: esperado } = await sb.rpc("cobre_saldo_esperado_comercio", {
              p_legajo: cuenta.cliente_legajo,
            });
            const jpay =
              Math.round(
                (Number(esperado ?? 0) - (enCurso.get(cuenta.cuenta_externa_id) ?? 0)) * 100,
              ) / 100;
            resumen.saldos.push({
              cuenta: cuenta.cuenta_externa_id,
              legajo: cuenta.cliente_legajo,
              cobre: saldoCobre,
              jpay,
            });
            if (Math.abs(saldoCobre - jpay) >= 0.01) {
              diferencias.push({
                tipo: "saldo_distinto",
                clave: `saldo:${modo}:${cuenta.cuenta_externa_id}`,
                transaccion: null,
                detalle: {
                  cuenta: cuenta.cuenta_externa_id,
                  legajo: cuenta.cliente_legajo,
                  saldo_cobre: saldoCobre,
                  saldo_jpay: jpay,
                  diferencia: Math.round((saldoCobre - jpay) * 100) / 100,
                },
              });
            }
          } else {
            saldosUsd.push(saldoCobre);
          }
        } catch (e) {
          resumen.errores.push(
            `${cuenta.cuenta_externa_id}: ${(e as Error).message}`.slice(0, 300),
          );
        }
      }
      // Global + USA de la matriz contra BANCO_COBRE_USD.
      if (!c.instanciaId && saldosUsd.length) {
        const cobre = Math.round(saldosUsd.reduce((a, b) => a + b, 0) * 100) / 100;
        const jpay =
          Math.round(
            ((await saldoCuenta(sb, "BANCO_COBRE_USD")) - (enCurso.get("USD") ?? 0)) * 100,
          ) / 100;
        resumen.saldos.push({ cuenta: "Global + USA", cobre, jpay, moneda: "USD" });
        if (Math.abs(cobre - jpay) >= 0.01) {
          diferencias.push({
            tipo: "saldo_distinto",
            clave: `saldo:${modo}:usd`,
            transaccion: null,
            detalle: {
              cuenta: "Global + USA",
              moneda: "USD",
              saldo_cobre: cobre,
              saldo_jpay: jpay,
              diferencia: Math.round((cobre - jpay) * 100) / 100,
            },
          });
        }
      }
    }

    // Envíos completados en JPay sin débito en Cobre (dentro de la ventana, con margen).
    if (!resumen.errores.length) {
      const { data: completadas } = await sb
        .from("cobre_transferencias")
        .select("id_txn, mm_id, monto, moneda")
        .eq("modo", modo)
        .eq("estado", "completada")
        .gte("created_at", new Date(desde.getTime() + 3_600_000).toISOString());
      for (const t of (completadas ?? []) as Obj[]) {
        if (t.mm_id && !vistos.has(String(t.mm_id))) {
          diferencias.push({
            tipo: "falta_en_proveedor",
            clave: String(t.mm_id),
            transaccion: null,
            detalle: {
              txid: t.id_txn,
              monto: Number(t.monto),
              moneda: t.moneda,
              nota: "Completada en JPay sin débito en Cobre",
            },
          });
        }
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

/** Saldo deudor de una cuenta del ledger (activo). */
async function saldoCuenta(sb: SupabaseClient, codigo: string): Promise<number> {
  const { data: cuenta } = await sb
    .from("ledger_accounts")
    .select("id")
    .eq("account_code", codigo)
    .single();
  let saldo = 0;
  for (let desde = 0; ; desde += 1000) {
    const { data } = await sb
      .from("ledger_entries")
      .select("entry_type, amount")
      .eq("account_id", cuenta?.id ?? "")
      .range(desde, desde + 999);
    for (const e of data ?? []) saldo += (e.entry_type === "debit" ? 1 : -1) * Number(e.amount);
    if (!data || data.length < 1000) break;
  }
  return saldo;
}

const DEBITOS_ENVIO = ["spei_debit", "fedwire_debit", "swift_debit"];

/** Cruza una transacción de Cobre con JPay: recupera lo que faltó y devuelve la diferencia, si hay. */
async function revisarTransaccion(
  sb: SupabaseClient,
  c: ConexionCobre,
  cuenta: Cuenta,
  t: Obj,
  vistos: Set<string>,
  enCurso: Map<string, number>,
): Promise<Diferencia | "recuperado" | null> {
  const modo = c.modo;
  const tx = transaccionCobre(t);
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
        p_cuenta_externa_id: dep.cuentaId ?? cuenta.cuenta_externa_id,
        p_clabe: dep.clabeDestino ?? undefined,
        p_monto: dep.monto,
        p_remitente: dep.remitente ?? undefined,
        p_remitente_cuenta: dep.remitenteCuenta ?? undefined,
        p_remitente_id: dep.remitenteId ?? undefined,
        p_clave_rastreo: dep.claveRastreo ?? undefined,
        p_cep: dep.cep ?? undefined,
        p_fecha: dep.fecha ?? undefined,
      });
      if (error)
        return {
          tipo: "falta_en_jpay",
          clave: tx.id,
          transaccion: tx.id,
          detalle: { monto: dep.monto, error: error.message },
        };
      return "recuperado";
    }
    if (Math.abs(Number(fila.monto) - dep.monto) >= 0.01) {
      return {
        tipo: "monto_distinto",
        clave: tx.id,
        transaccion: tx.id,
        detalle: { cobre: dep.monto, jpay: Number(fila.monto) },
      };
    }
    return null;
  }

  if (tx.tipo === "r2p_spei_credit") {
    const { data: fila } = await sb
      .from("cobre_depositos")
      .select("monto")
      .eq("modo", modo)
      .eq("transaccion_externa_id", tx.id)
      .maybeSingle();
    if (fila) return null;
    try {
      await acreditarCobroR2p(sb, modo, {
        ...t,
        account_id: tx.cuentaId ?? cuenta.cuenta_externa_id,
      });
      return "recuperado";
    } catch (e) {
      return {
        tipo: "falta_en_jpay",
        clave: tx.id,
        transaccion: tx.id,
        detalle: { monto: tx.monto, tipo: tx.tipo, error: (e as Error).message },
      };
    }
  }

  if (tx.tipo === "spei_rejected") {
    const r = await aplicarRebote(sb, modo, { mmId: tx.mmId, externalId: tx.mmExternalId });
    return r === "reintegrado" ? "recuperado" : null;
  }

  const mmId = tx.mmId;
  if (!mmId) return null;
  const monto = Math.abs(tx.monto);

  if (tx.tipo === "cbmm_debit" || tx.tipo === "cbmm_credit") {
    const { data: cruce } = await sb
      .from("cobre_cruces")
      .select("monto_mxn, monto_usd")
      .eq("modo", modo)
      .or(
        `mm_id.eq.${mmId.replace(/[^\w-]/g, "")},external_id.eq.${(tx.mmExternalId ?? "-").replace(/[^\w-]/g, "")}`,
      )
      .limit(1)
      .maybeSingle();
    if (!cruce)
      return {
        tipo: "falta_en_jpay",
        clave: `${mmId}:${tx.tipo}`,
        transaccion: tx.id,
        detalle: { monto, tipo: tx.tipo, nota: "Conversión en Cobre que JPay no tiene" },
      };
    const esperado = Number(tx.tipo === "cbmm_debit" ? cruce.monto_mxn : cruce.monto_usd);
    if (Math.abs(esperado - monto) >= 0.01) {
      return {
        tipo: "monto_distinto",
        clave: `${mmId}:${tx.tipo}`,
        transaccion: tx.id,
        detalle: { cobre: monto, jpay: esperado, tipo: tx.tipo },
      };
    }
    return null;
  }

  if (tx.tipo === "global_pay_to_usa_debit" || tx.tipo === "global_pay_to_usa_credit") {
    const { data: envio } = await sb
      .from("cobre_transferencias")
      .select("monto")
      .eq("modo", modo)
      .eq("traslado_mm_id", mmId)
      .maybeSingle();
    if (!envio)
      return {
        tipo: "falta_en_jpay",
        clave: `${mmId}:${tx.tipo}`,
        transaccion: tx.id,
        detalle: { monto, tipo: tx.tipo, nota: "Traslado Global→USA que JPay no tiene" },
      };
    return Math.abs(Number(envio.monto) - monto) >= 0.01
      ? {
          tipo: "monto_distinto",
          clave: `${mmId}:${tx.tipo}`,
          transaccion: tx.id,
          detalle: { cobre: monto, jpay: Number(envio.monto) },
        }
      : null;
  }

  if (!DEBITOS_ENVIO.includes(tx.tipo)) {
    // Débito de una devolución de depósito (spei_return) u otro movimiento de JPay.
    const { data: dev } = await sb
      .from("cobre_depositos")
      .select("monto")
      .eq("devolucion_mm_id", mmId)
      .maybeSingle();
    if (dev) return null;
    return tx.monto < 0
      ? {
          tipo: "falta_en_jpay",
          clave: mmId,
          transaccion: tx.id,
          detalle: { monto, tipo: tx.tipo, nota: "Movimiento en Cobre que JPay no tiene" },
        }
      : null;
  }

  vistos.add(mmId);
  const { data: envio } = await sb
    .from("cobre_transferencias")
    .select("monto, estado")
    .eq("modo", modo)
    .or(
      `mm_id.eq.${mmId.replace(/[^\w-]/g, "")},id_txn.eq.${(tx.mmExternalId ?? "-").replace(/[^\w-]/g, "")}`,
    )
    .limit(1)
    .maybeSingle();
  if (!envio)
    return {
      tipo: "falta_en_jpay",
      clave: mmId,
      transaccion: tx.id,
      detalle: { monto, tipo: tx.tipo, nota: "Envío en Cobre que JPay no tiene" },
    };
  if (["pendiente", "enviando", "trasladando"].includes(envio.estado)) {
    const clave = cuenta.moneda === "USD" ? "USD" : cuenta.cuenta_externa_id;
    enCurso.set(clave, (enCurso.get(clave) ?? 0) + monto);
  }
  if (Math.abs(Number(envio.monto) - monto) >= 0.01) {
    return {
      tipo: "monto_distinto",
      clave: mmId,
      transaccion: tx.id,
      detalle: { cobre: monto, jpay: Number(envio.monto) },
    };
  }
  return null;
}
