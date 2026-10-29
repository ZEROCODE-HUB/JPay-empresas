// Dólares (Solution Design §4.4–§4.7), siempre en la instancia matriz de JPay:
// - Conversión: cotización `static_quote` `mxn/usd` (vale 25 s; el Balance MX del comercio debe
//   tener el monto) → reserva de los pesos → `POST /cross_border_money_movements` del Balance del
//   comercio al Balance Global USD de JPay. Al `completed` entran los dólares en la subcuenta USD
//   del comercio. Una cotización vencida nunca se reintenta: se pide otra.
// - Envío (Fedwire o SWIFT): reserva USD → traslado `global_pay_to_usa` (Global → USA, external_id
//   `<TXID>-T`) → al `completed`, money movement `fedwire`/`swift` desde el Balance USA. Estados en
//   `cobre_transferencias` (`trasladando` mientras corre el traslado).
// Lo usan `cobre-fx`, `cobre-transferencias`, `cobre-webhook` y la revisión de pendientes.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { aCentavos, CobreError, deCentavos, resumirTransferencia } from "./cobre.ts";
import type { ConexionCobre } from "./cobre-servidor.ts";
import { aplicarEstadoTransferencia } from "./cobre-transferencias.ts";

type Obj = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v ? v : null);
const ahora = () => new Date().toISOString();

/** Horario on-market del par MXN/USD: 05:00 a 16:00 en UTC−5 (fuera de eso puede haber off_market). */
export function enHorarioMercado(d = new Date()): boolean {
  const h = (d.getUTCHours() + 24 - 5) % 24;
  return h >= 5 && h < 16;
}

/** Balances Global y USA de la instancia matriz (creados desde el admin). */
export async function balancesMatriz(
  sb: SupabaseClient,
  modo: string,
): Promise<{ global: string; usa: string }> {
  const { data } = await sb
    .from("cobre_cuentas")
    .select("tipo, cuenta_externa_id")
    .eq("modo", modo)
    .in("tipo", ["global", "usa"])
    .eq("estado", "activa");
  const filas = (data ?? []) as { tipo: string; cuenta_externa_id: string }[];
  const global = filas.find((f) => f.tipo === "global")?.cuenta_externa_id;
  const usa = filas.find((f) => f.tipo === "usa")?.cuenta_externa_id;
  if (!global || !usa) {
    throw new CobreError(
      409,
      "Faltan los Balances Global y USA de JPay (admin > País y proveedores)",
    );
  }
  return { global, usa };
}

/** Subcuenta en dólares del comercio; la crea la primera vez. */
export async function subcuentaUsd(sb: SupabaseClient, legajo: string): Promise<string> {
  const { data } = await sb
    .from("subaccounts")
    .select("id")
    .eq("cliente_legajo", legajo)
    .eq("moneda", "USD")
    .eq("estado", "Activa")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (data) return data.id;
  const { data: nueva, error } = await sb
    .from("subaccounts")
    .insert({ cliente_legajo: legajo, nombre: "Dólares", tipo: "Operativa", moneda: "USD" })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear la subcuenta en dólares: ${error.message}`);
  return nueva.id;
}

/** Balance MX del comercio en la matriz (los comercios con instancia propia no convierten acá). */
export async function balanceComercio(
  sb: SupabaseClient,
  modo: string,
  legajo: string,
): Promise<{ cuentaExterna: string; subcuentaId: string | null }> {
  const { data } = await sb
    .from("cobre_cuentas")
    .select("cuenta_externa_id, subcuenta_id, instancia_id")
    .eq("modo", modo)
    .eq("tipo", "cliente")
    .eq("cliente_legajo", legajo)
    .eq("estado", "activa")
    .maybeSingle();
  if (!data)
    throw new CobreError(409, "El comercio todavía no tiene su cuenta en Cobre (alta pendiente)");
  return { cuentaExterna: data.cuenta_externa_id, subcuentaId: data.subcuenta_id };
}

const nuevoExternal = (prefijo: string) =>
  `${prefijo}${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

// ── Conversión MXN → USD ─────────────────────────────────────────────────────

export async function cotizarCruce(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  o: { legajo: string; subcuentaMxnId: string; montoMxn: number },
): Promise<Obj> {
  if (conexion.instanciaId)
    throw new CobreError(409, "La conversión a dólares es de la cuenta de JPay");
  if (!(o.montoMxn > 0)) throw new CobreError(400, "Monto inválido");
  await balanceComercio(sb, conexion.modo, o.legajo);
  await balancesMatriz(sb, conexion.modo);
  const q = await conexion.cliente.post<Obj>("/fx_quotes", {
    currency_pair: "mxn/usd",
    source_amount: aCentavos(o.montoMxn),
    type: "static_quote",
  });
  const destino = Number(q.destination_amount);
  const tasa = Number(q.fx_rate);
  if (!(destino > 0) || !(tasa > 0) || !s(q.id) || !s(q.valid_until)) {
    throw new CobreError(502, "Cobre devolvió una cotización incompleta");
  }
  const externo = nuevoExternal("FX");
  const { data, error } = await sb
    .from("cobre_cruces")
    .insert({
      modo: conexion.modo,
      cliente_legajo: o.legajo,
      subcuenta_mxn_id: o.subcuentaMxnId,
      subcuenta_usd_id: await subcuentaUsd(sb, o.legajo),
      cotizacion_id: q.id,
      tasa,
      monto_mxn: deCentavos(Number(q.source_amount ?? aCentavos(o.montoMxn))),
      monto_usd: deCentavos(destino),
      comisiones: (q.fees_breakdown ?? {}) as Obj,
      fuera_de_mercado: q.off_market === true,
      cotizacion_vence_at: q.valid_until,
      external_id: externo,
      idempotency: externo,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function ejecutarCruce(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  cruce: Obj,
): Promise<Obj> {
  const id = String(cruce.id);
  if (cruce.estado !== "cotizado") {
    if (cruce.estado === "enviando") return await reenviarCruce(sb, conexion, cruce);
    return cruce;
  }
  if (new Date(String(cruce.cotizacion_vence_at)).getTime() <= Date.now()) {
    await sb.from("cobre_cruces").update({ estado: "vencida", updated_at: ahora() }).eq("id", id);
    throw new CobreError(409, "La cotización venció; pedí una nueva");
  }
  const { data: res, error } = await sb.rpc("cobre_reservar_cruce", { p_cruce_id: id });
  if (error) throw new Error(error.message);
  const r = res as { ok: boolean; motivo?: string };
  if (!r.ok) {
    await sb
      .from("cobre_cruces")
      .update({ estado: "error_envio", motivo: r.motivo, updated_at: ahora() })
      .eq("id", id);
    throw new CobreError(409, r.motivo ?? "No se pudo reservar el saldo");
  }
  await sb.from("cobre_cruces").update({ estado: "enviando", updated_at: ahora() }).eq("id", id);
  return await reenviarCruce(sb, conexion, { ...cruce, estado: "enviando" });
}

/** Manda (o reenvía con la misma clave) el Cross Border. Nunca con una clave nueva. */
async function reenviarCruce(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  cruce: Obj,
): Promise<Obj> {
  const id = String(cruce.id);
  const [comercio, matriz] = await Promise.all([
    balanceComercio(sb, conexion.modo, String(cruce.cliente_legajo)),
    balancesMatriz(sb, conexion.modo),
  ]);
  let mm: Obj;
  try {
    mm = await conexion.cliente.post<Obj>(
      "/cross_border_money_movements",
      {
        source_id: comercio.cuentaExterna,
        destination_id: matriz.global,
        forex_quote_id: cruce.cotizacion_id,
        metadata: { destination_description: `Conversion ${cruce.cliente_legajo}`.slice(0, 40) },
        external_id: cruce.external_id,
      },
      String(cruce.idempotency),
    );
  } catch (e) {
    if (
      e instanceof CobreError &&
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 408 &&
      e.status !== 429
    ) {
      if (e.status === 409 && /idempot/i.test(e.message)) throw e; // ya aceptado: lo cierra el aviso
      await sb.rpc("cobre_liberar_cruce", { p_cruce_id: id });
      await sb
        .from("cobre_cruces")
        .update({ estado: "error_envio", codigo: e.codigo, motivo: e.message, updated_at: ahora() })
        .eq("id", id);
    }
    throw e;
  }
  await sb
    .from("cobre_cruces")
    .update({ mm_id: s(mm.id), updated_at: ahora() })
    .eq("id", id);
  await aplicarEstadoCruce(sb, conexion, mm, null);
  const { data } = await sb.from("cobre_cruces").select("*").eq("id", id).single();
  return data as Obj;
}

/** Estado del Cross Border (aviso `cross_border_money_movements.status.*` o GET). */
export async function aplicarEstadoCruce(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  cbmm: unknown,
  evento: string | null,
): Promise<string> {
  const m = (cbmm ?? {}) as Obj;
  const st = (m.status ?? {}) as Obj;
  const estado = s(st.state) ?? (evento ? evento.split(".").pop()! : null);
  const mmId = (s(m.id) ?? "").replace(/[^\w-]/g, "");
  const ext = (s(m.external_id) ?? "").replace(/[^\w-]/g, "");
  if (!estado || (!mmId && !ext)) return "sin datos";
  const { data: c } = await sb
    .from("cobre_cruces")
    .select("id, estado")
    .eq("modo", conexion.modo)
    .or(`mm_id.eq.${mmId || "-"},external_id.eq.${ext || "-"}`)
    .limit(1)
    .maybeSingle();
  if (!c) return "desconocido";
  if (["completada", "rechazada", "fallida", "vencida", "error_envio"].includes(c.estado))
    return c.estado;
  const codigo = s(st.code);
  const motivo = s(st.description);
  if (estado === "completed") {
    const { error } = await sb.rpc("cobre_confirmar_cruce", { p_cruce_id: c.id });
    if (error) throw new Error(`No se pudo acreditar la conversión: ${error.message}`);
    await sb
      .from("cobre_cruces")
      .update({ estado: "completada", mm_id: mmId || undefined, updated_at: ahora() })
      .eq("id", c.id);
    return "completada";
  }
  if (estado === "rejected" || estado === "failed" || estado === "canceled") {
    const { error } = await sb.rpc("cobre_liberar_cruce", { p_cruce_id: c.id });
    if (error) throw new Error(`No se pudo liberar la conversión: ${error.message}`);
    const final = estado === "rejected" ? "rechazada" : "fallida";
    await sb
      .from("cobre_cruces")
      .update({
        estado: final,
        codigo,
        motivo: motivo ?? (codigo === "F002" ? "Fondos insuficientes" : null),
        updated_at: ahora(),
      })
      .eq("id", c.id);
    return final;
  }
  if (estado === "initiated" || estado === "processing") {
    await sb.from("cobre_cruces").update({ estado, updated_at: ahora() }).eq("id", c.id);
  }
  return estado;
}

// ── Envíos USD: traslado Global → USA y pago Fedwire / SWIFT ─────────────────

type FilaEnvio = Obj & { id: string; id_txn: string; estado: string; mm_id: string | null };

const externalTraslado = (idTxn: string) => `${idTxn}-T`;

/** Primer paso del envío USD: traslado del monto del Balance Global al USA. */
export async function iniciarEnvioUsd(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  t: FilaEnvio,
): Promise<string> {
  const { global, usa } = await balancesMatriz(sb, conexion.modo);
  const ext = externalTraslado(t.id_txn);
  await sb
    .from("cobre_transferencias")
    .update({ estado: "trasladando", updated_at: ahora() })
    .eq("id", t.id);
  let mm: Obj;
  try {
    mm = await conexion.cliente.post<Obj>(
      "/money_movements",
      {
        source_id: global,
        destination_id: usa,
        amount: aCentavos(Number(t.monto)),
        metadata: { description: `Traslado Global a USA ${t.id_txn}`.slice(0, 60) },
        external_id: ext,
        checker_approval: false,
      },
      ext,
    );
  } catch (e) {
    if (
      e instanceof CobreError &&
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 408 &&
      e.status !== 429
    ) {
      await cerrarEnvioUsd(
        sb,
        t,
        `No se pudo mover el saldo al Balance USA: ${e.message}`,
        e.codigo,
      );
    }
    throw e;
  }
  await sb
    .from("cobre_transferencias")
    .update({
      traslado_mm_id: s(mm.id),
      traslado_estado: s((mm.status as Obj)?.state),
      updated_at: ahora(),
    })
    .eq("id", t.id);
  return await aplicarEstadoEnvioUsd(sb, conexion, mm);
}

/** Segundo paso: el pago Fedwire o SWIFT desde el Balance USA (idempotencia = TXID). */
export async function pagarEnvioUsd(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  t: FilaEnvio,
): Promise<string> {
  const { usa } = await balancesMatriz(sb, conexion.modo);
  const { data: cp } = await sb
    .from("cobre_contrapartes")
    .select("contraparte_externa_id")
    .eq("id", String(t.contraparte_id))
    .single();
  let mm: Obj;
  try {
    mm = await conexion.cliente.post<Obj>(
      "/money_movements",
      {
        amount: aCentavos(Number(t.monto)),
        source_id: usa,
        destination_id: cp?.contraparte_externa_id,
        metadata: { description: String(t.concepto ?? "Pago").slice(0, 60), category: "" },
        external_id: t.id_txn,
        checker_approval: false,
      },
      t.id_txn,
    );
  } catch (e) {
    if (
      e instanceof CobreError &&
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 408 &&
      e.status !== 429
    ) {
      // El USD ya está en el Balance USA: se libera la reserva del comercio (queda en tesorería).
      await cerrarEnvioUsd(sb, t, e.message, e.codigo);
    }
    throw e;
  }
  const r = resumirTransferencia(mm);
  await sb
    .from("cobre_transferencias")
    .update({
      mm_id: r.id || null,
      estado: "pendiente",
      cuenta_origen_externa_id: usa,
      updated_at: ahora(),
    })
    .eq("id", t.id);
  if (r.estado !== "pendiente") {
    await aplicarEstadoTransferencia(sb, { ...t, estado: "pendiente", mm_id: r.id || null }, mm);
  }
  return r.estado;
}

/** Aviso de un money movement `global_pay_to_usa`, `fedwire` o `swift`. */
export async function aplicarEstadoEnvioUsd(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  mm: unknown,
): Promise<string> {
  const m = (mm ?? {}) as Obj;
  const r = resumirTransferencia(m);
  const ext = r.externalId ?? "";
  if (m.type === "global_pay_to_usa" || ext.endsWith("-T")) {
    const idTxn = ext.replace(/-T$/, "").replace(/[^\w-]/g, "");
    const mmId = r.id.replace(/[^\w-]/g, "");
    const { data: t } = await sb
      .from("cobre_transferencias")
      .select("*")
      .eq("modo", conexion.modo)
      .or(`traslado_mm_id.eq.${mmId || "-"},id_txn.eq.${idTxn || "-"}`)
      .limit(1)
      .maybeSingle();
    if (!t) return "traslado desconocido";
    await sb
      .from("cobre_transferencias")
      .update({
        traslado_mm_id: t.traslado_mm_id ?? (r.id || null),
        traslado_estado: r.estadoCobre,
        updated_at: ahora(),
      })
      .eq("id", t.id);
    if (t.estado !== "trasladando") return `traslado ${r.estadoCobre} (envío ${t.estado})`;
    if (r.estado === "completada")
      return `traslado completo, pago ${await pagarEnvioUsd(sb, conexion, t as FilaEnvio)}`;
    if (["rechazada", "fallida", "cancelada"].includes(r.estado)) {
      await cerrarEnvioUsd(
        sb,
        t as FilaEnvio,
        r.motivo ?? "No se pudo mover el saldo al Balance USA",
        r.codigo,
      );
      return `traslado ${r.estado}`;
    }
    return `traslado ${r.estadoCobre}`;
  }
  const mmId = r.id.replace(/[^\w-]/g, "");
  const idTxn = ext.replace(/[^\w-]/g, "");
  const { data: t } = await sb
    .from("cobre_transferencias")
    .select("id, id_txn, estado, mm_id")
    .eq("modo", conexion.modo)
    .or(`mm_id.eq.${mmId || "-"},id_txn.eq.${idTxn || "-"}`)
    .limit(1)
    .maybeSingle();
  if (!t) return "pago USD desconocido";
  const res = await aplicarEstadoTransferencia(sb, t, m);
  return res.estado;
}

/** Cierra un envío USD que no llegó a pagarse: libera la reserva del comercio. */
async function cerrarEnvioUsd(
  sb: SupabaseClient,
  t: FilaEnvio,
  motivo: string,
  codigo: string | null,
) {
  const { error } = await sb.rpc("cancelar_transferencia_bdc", {
    p_origin_id: t.id_txn,
    p_motivo: motivo,
  });
  if (error) throw new Error(`No se pudo liberar ${t.id_txn}: ${error.message}`);
  await sb
    .from("cobre_transferencias")
    .update({ estado: "fallida", codigo, motivo, updated_at: ahora() })
    .eq("id", t.id);
}
