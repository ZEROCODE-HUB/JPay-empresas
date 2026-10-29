// Edge Function: envíos por Cobre (Solution Design §4.3, §4.6 y §4.7). Body: { accion, ... }.
//
// Cliente (su sesión):
// - `contraparte` { tipo: clabe|spei_card|business, … }: registra el destinatario en Cobre (o
//   reusa el existente). CLABE: se pide la verificación de titular (`mex_acc_ownership_1`,
//   asíncrona). Business (USD): Fedwire (ABA) o SWIFT (BIC); Cobre la verifica por su cuenta.
// - `verificacion` { contraparte_id }: consulta el resultado de la verificación.
// - `enviar` { subcuenta_id, contraparte_id, monto, concepto?, id_txn, codigo? }:
//   · SPEI (MXN): desde el Balance del comercio, solo a CLABEs con titular `matched`.
//   · USD: desde la subcuenta en dólares, a contrapartes `verified`; traslado Global→USA y pago.
//   OTP (si `exigir_otp`) → reserva en el ledger (reglas, comisión, saldo) → Cobre con
//   idempotencia = TXID. Sobre el monto de aprobación queda `pendiente_aprobacion` (con la reserva
//   hecha) hasta que un admin decide; recién ahí sale a Cobre.
// - `lote` { subcuenta_id, id_lote, items: [{ contraparte_id, monto, concepto? }], codigo? }:
//   envío masivo SPEI (`/bulk_money_movements`); cada ítem se reserva y se sigue por su estado.
// - `consultar` { transferencia_id }: trae el estado de Cobre y lo aplica.
// Admin:
// - `decidir` { transferencia_id | lote_id, aprobar, nota }: aprueba (sale a Cobre) o rechaza
//   (libera las reservas).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  CobreError,
  contraparteMx,
  contraparteUsd,
  referenciaNumerica,
  resumirTransferencia,
  SIN_DEBITO,
  transferenciaSpei,
  verificacionUsd,
  type DestinatarioUsd,
} from "../_shared/cobre.ts";
import { conexionCobre, conexionDeCliente, type ConexionCobre } from "../_shared/cobre-servidor.ts";
import { aplicarEstadoTransferencia } from "../_shared/cobre-transferencias.ts";
import { enviarLote, nombreArchivoLote } from "../_shared/cobre-lotes.ts";
import { aplicarEstadoEnvioUsd, iniciarEnvioUsd } from "../_shared/cobre-usd.ts";
import {
  bearerToken,
  esAdmin,
  handler,
  HttpError,
  json,
  readJson,
  serviceClient,
  userClient,
} from "../_shared/http.ts";

type Body = Record<string, unknown> & { accion?: unknown };
type Obj = Record<string, unknown>;
type Ctx = { sb: SupabaseClient; conexion: ConexionCobre; req: Request };

const texto = (v: unknown, max = 120) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const MAX_ITEMS_LOTE = 500;

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    const admin = await esAdmin(req);
    try {
      if (body.accion === "decidir") {
        if (!admin) throw new HttpError(403, "Solo para administradores");
        return json(await decidir(sb, req, body));
      }
      if (body.accion === "consultar" && admin) {
        return json(await consultar({ sb, conexion: conexionCobre(sb), req }, null, body));
      }
      const legajo = await legajoDeSesion(req);
      const ctx: Ctx = { sb, conexion: await conexionDeCliente(sb, legajo), req };
      switch (body.accion) {
        case "contraparte":
          return json(await registrarContraparte(ctx, legajo, body));
        case "verificacion":
          return json(await consultarVerificacion(ctx, legajo, body));
        case "enviar":
          return json(await enviar(ctx, legajo, body));
        case "lote":
          return json(await lote(ctx, legajo, body));
        case "consultar":
          return json(await consultar(ctx, legajo, body));
        default:
          throw new HttpError(400, "Acción inválida");
      }
    } catch (e) {
      if (e instanceof CobreError) {
        throw new HttpError(e.status >= 400 && e.status < 500 ? 422 : 502, `Cobre: ${e.message}`);
      }
      throw e;
    }
  }),
);

async function legajoDeSesion(req: Request): Promise<string> {
  const { data, error } = await userClient(req).rpc("current_cliente_legajo");
  if (error || typeof data !== "string" || !data) throw new HttpError(403, "Cliente no encontrado");
  return data;
}

// ── Destinatarios ────────────────────────────────────────────────────────────

async function registrarContraparte(ctx: Ctx, legajo: string, b: Body) {
  if (b.tipo === "business") return await registrarContraparteUsd(ctx, legajo, b);
  const tipo = b.tipo === "spei_card" ? "spei_card" : "clabe";
  const idTipo = b.id_tipo === "curp" ? "curp" : "rfc";
  const numero = String(b.numero ?? "").replace(/\D/g, "");
  const idNumero = String(b.id_numero ?? "")
    .trim()
    .toUpperCase();
  const titular = texto(b.titular, 80);
  if (!titular) throw new HttpError(400, "Falta el nombre del titular");
  if (!/^[A-Z0-9&Ñ]{10,18}$/.test(idNumero)) throw new HttpError(400, "RFC o CURP inválido");

  const { data: existente } = await ctx.sb
    .from("cobre_contrapartes")
    .select("*")
    .eq("modo", ctx.conexion.modo)
    .eq("cliente_legajo", legajo)
    .eq("numero", numero)
    .eq("id_numero", idNumero)
    .maybeSingle();
  let fila = existente;
  if (!fila) {
    let cuerpo;
    try {
      cuerpo = contraparteMx({
        tipo,
        numero,
        banco: texto(b.banco, 10),
        titular,
        idTipo,
        idNumero,
        alias: texto(b.alias, 32),
      });
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const cp = await ctx.conexion.cliente.post<{ id: string }>("/counterparties", cuerpo);
    const { data, error } = await ctx.sb
      .from("cobre_contrapartes")
      .insert({
        cliente_legajo: legajo,
        modo: ctx.conexion.modo,
        tipo,
        numero,
        banco: texto(b.banco, 10),
        titular,
        id_tipo: idTipo,
        id_numero: idNumero,
        alias: texto(b.alias, 32),
        contraparte_externa_id: cp.id,
      })
      .select("*")
      .single();
    if (error) throw new HttpError(500, error.message);
    fila = data;
  }

  // La titularidad se verifica siempre antes de pagar (solo `matched` permite enviar).
  const repetir =
    fila.verificacion === "unresolved" &&
    fila.verificado_at &&
    Date.now() - new Date(fila.verificado_at).getTime() >= 12 * 3_600_000;
  if (tipo === "clabe" && (fila.verificacion === "sin_verificar" || repetir)) {
    const av = await ctx.conexion.cliente.post<{ id: string }>("/account_verifications", {
      model: "mex_acc_ownership_1",
      verification_request: {
        account_number: numero,
        account_type: "clabe",
        account_holder_id_type: idTipo,
        account_holder_id_number: idNumero,
      },
      external_id: `AV-${fila.id}`.slice(0, 60),
    });
    const { data, error } = await ctx.sb
      .from("cobre_contrapartes")
      .update({ verificacion_externa_id: av.id, verificacion: "procesando" })
      .eq("id", fila.id)
      .select("*")
      .single();
    if (error) throw new HttpError(500, error.message);
    fila = data;
  }
  return fila;
}

async function registrarContraparteUsd(ctx: Ctx, legajo: string, b: Body) {
  const d = (b.destinatario ?? {}) as DestinatarioUsd;
  let cuerpo: Obj;
  try {
    cuerpo = contraparteUsd(d);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const bank = (cuerpo.metadata as Obj).counterparty_bank_details as Obj;
  const numero = String(bank.account_number);
  const idNumero = d.idNumero.trim().toUpperCase().slice(0, 40) || "ND";
  const { data: existente } = await ctx.sb
    .from("cobre_contrapartes")
    .select("*")
    .eq("modo", ctx.conexion.modo)
    .eq("cliente_legajo", legajo)
    .eq("numero", numero)
    .eq("id_numero", idNumero)
    .maybeSingle();
  if (existente) return existente;
  const cp = await ctx.conexion.cliente.post<Obj>("/counterparties", cuerpo);
  const { data, error } = await ctx.sb
    .from("cobre_contrapartes")
    .insert({
      cliente_legajo: legajo,
      modo: ctx.conexion.modo,
      tipo: "business",
      rail: d.rail,
      geo: String(cuerpo.geo),
      numero,
      banco: String(bank.bank_name).slice(0, 60),
      titular: d.titular.trim().slice(0, 80),
      id_tipo: ["nit", "ein", "tax_id"].includes(d.idTipo) ? d.idTipo : "otro",
      id_numero: idNumero,
      alias: texto(d.alias, 32),
      contraparte_externa_id: String(cp.id),
      datos: cuerpo.metadata as Obj,
      verificacion: verificacionUsd(cp),
    })
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  return data;
}

async function consultarVerificacion(ctx: Ctx, legajo: string, b: Body) {
  const { data: cp } = await ctx.sb
    .from("cobre_contrapartes")
    .select("*")
    .eq("id", String(b.contraparte_id ?? ""))
    .eq("cliente_legajo", legajo)
    .maybeSingle();
  if (!cp) throw new HttpError(404, "Destinatario inexistente");
  if (cp.verificacion !== "procesando") return cp;
  let nuevo: string | null = null;
  let motivo: string | null = null;
  if (cp.tipo === "business") {
    const r = await ctx.conexion.cliente.get<Obj>(`/counterparties/${cp.contraparte_externa_id}`);
    nuevo = verificacionUsd(r);
    const meta = (r.metadata ?? {}) as Obj;
    motivo =
      typeof meta.counterparty_verification_description === "string"
        ? meta.counterparty_verification_description || null
        : null;
    if (nuevo === "procesando") return cp;
  } else {
    if (!cp.verificacion_externa_id) return cp;
    const av = await ctx.conexion.cliente.get<Obj>(
      `/account_verifications/${cp.verificacion_externa_id}`,
    );
    const resp = av?.verification_response;
    const r = typeof resp === "string" ? resp : (resp as Obj | undefined)?.verification_result;
    if (r !== "matched" && r !== "unmatched" && r !== "unresolved") return cp;
    nuevo = r;
  }
  const { data, error } = await ctx.sb
    .from("cobre_contrapartes")
    .update({
      verificacion: nuevo,
      verificacion_motivo: motivo,
      verificado_at: new Date().toISOString(),
    })
    .eq("id", cp.id)
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  return data;
}

// ── Envío ────────────────────────────────────────────────────────────────────

async function verificarOtp(ctx: Ctx, codigo: unknown) {
  if (typeof codigo !== "string" || !/^\d{6}$/.test(codigo)) {
    throw new HttpError(400, "Ingresá el código de 6 dígitos que te enviamos");
  }
  const token = bearerToken(ctx.req);
  const { data: u } = await ctx.sb.auth.getUser(token ?? "");
  const correo = u?.user?.email?.toLowerCase().trim();
  if (!correo) throw new HttpError(401, "Sesión inválida");
  const { data: otp } = await ctx.sb
    .from("otp_transferencias")
    .select("id, codigo, expires_at, intentos")
    .eq("correo", correo)
    .eq("usado", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!otp || new Date(otp.expires_at).getTime() < Date.now() || (otp.intentos ?? 0) >= 5) {
    if (otp) await ctx.sb.from("otp_transferencias").update({ usado: true }).eq("id", otp.id);
    throw new HttpError(400, "El código expiró o ya se usó. Pedí uno nuevo.");
  }
  if (otp.codigo !== codigo) {
    await ctx.sb
      .from("otp_transferencias")
      .update({ intentos: (otp.intentos ?? 0) + 1 })
      .eq("id", otp.id);
    throw new HttpError(400, "Código incorrecto");
  }
  await ctx.sb.from("otp_transferencias").update({ usado: true }).eq("id", otp.id);
}

/** Balance MX del comercio en su instancia (el origen de todo SPEI). */
async function balanceDelComercio(ctx: Ctx, legajo: string): Promise<string> {
  const { data } = await ctx.sb
    .from("cobre_cuentas")
    .select("cuenta_externa_id, conectividad")
    .eq("tipo", "cliente")
    .eq("cliente_legajo", legajo)
    .eq("modo", ctx.conexion.modo)
    .eq("estado", "activa")
    .maybeSingle();
  if (!data) throw new HttpError(409, "Tu cuenta en Cobre todavía no está habilitada");
  if (data.conectividad && data.conectividad !== "connected") {
    throw new HttpError(409, "Tu cuenta en Cobre todavía no está activa");
  }
  return data.cuenta_externa_id;
}

type Reserva = {
  ok: boolean;
  motivo?: string;
  transaction_id?: string;
  comision?: number;
  impuesto?: number;
};

async function reservar(
  ctx: Ctx,
  o: {
    subcuentaId: string;
    idTxn: string;
    destino: string;
    monto: number;
    concepto: string;
    titular: string;
    banco: string | null;
  },
): Promise<Reserva> {
  const { data, error } = await userClient(ctx.req).rpc("reservar_transferencia_bdc", {
    p_subcuenta_origen: o.subcuentaId,
    p_origin_id: o.idTxn,
    p_destinatario_cbu: o.destino,
    p_monto: o.monto,
    p_concepto: o.concepto,
    p_destinatario_nombre: o.titular,
    p_destinatario_banco: o.banco ?? undefined,
  });
  if (error) throw new HttpError(400, error.message);
  return data as Reserva;
}

async function enviar(ctx: Ctx, legajo: string, b: Body) {
  const idTxn = String(b.id_txn ?? "").trim();
  if (!/^[A-Za-z0-9-]{9,40}$/.test(idTxn))
    throw new HttpError(400, "id_txn inválido (9 a 40 caracteres)");
  const monto = Number(b.monto);
  if (!(monto > 0) || Math.round(monto * 100) !== monto * 100)
    throw new HttpError(400, "Monto inválido");
  const subcuentaId = String(b.subcuenta_id ?? "");
  const concepto = texto(b.concepto, 40) ?? "Transferencia";

  // Reintento del mismo envío: se devuelve lo que ya hay (nunca se manda dos veces).
  const { data: previa } = await ctx.sb
    .from("cobre_transferencias")
    .select("*")
    .eq("id_txn", idTxn)
    .maybeSingle();
  if (previa) {
    if (previa.cliente_legajo !== legajo)
      throw new HttpError(403, "El TXID pertenece a otra cuenta");
    return previa;
  }

  const [{ data: conf }, { data: cp }, { data: sub }] = await Promise.all([
    ctx.sb
      .from("cobre_configuracion")
      .select("exigir_otp, monto_aprobacion, monto_aprobacion_usd")
      .eq("id", 1)
      .single(),
    ctx.sb
      .from("cobre_contrapartes")
      .select("id, tipo, rail, numero, titular, banco, contraparte_externa_id, verificacion")
      .eq("id", String(b.contraparte_id ?? ""))
      .eq("cliente_legajo", legajo)
      .eq("modo", ctx.conexion.modo)
      .maybeSingle(),
    ctx.sb
      .from("subaccounts")
      .select("id, cliente_legajo, moneda")
      .eq("id", subcuentaId)
      .maybeSingle(),
  ]);
  if (!cp) throw new HttpError(404, "Destinatario inexistente");
  if (!sub || sub.cliente_legajo !== legajo) throw new HttpError(404, "Subcuenta inexistente");
  const usd = cp.tipo === "business";
  if (usd !== (sub.moneda === "USD")) {
    throw new HttpError(
      409,
      usd
        ? "Los envíos en dólares salen de tu subcuenta en dólares"
        : "Elegí una subcuenta en pesos",
    );
  }
  if (usd) {
    if (ctx.conexion.instanciaId)
      throw new HttpError(409, "Los envíos en dólares son por la cuenta de JPay");
    if (monto < 1) throw new HttpError(400, "El mínimo por envío en dólares es 1.00 USD");
    if (cp.verificacion !== "verified")
      throw new HttpError(409, "Cobre todavía no verificó a este beneficiario");
  } else if (cp.tipo === "clabe" && cp.verificacion !== "matched") {
    throw new HttpError(
      409,
      cp.verificacion === "unmatched"
        ? "La CLABE del destinatario no coincide con su RFC/CURP"
        : "Todavía no confirmamos que la CLABE sea del titular; probá en unos minutos",
    );
  }
  if (conf?.exigir_otp) await verificarOtp(ctx, b.codigo);
  const origen = usd ? null : await balanceDelComercio(ctx, legajo);

  // 1) Reserva (con la sesión del cliente: valida dueño, reglas, comisión y saldo).
  const r = await reservar(ctx, {
    subcuentaId,
    idTxn,
    destino: cp.numero,
    monto,
    concepto,
    titular: cp.titular,
    banco: cp.banco,
  });
  if (r.ok === false) throw new HttpError(409, r.motivo ?? "La transferencia fue rechazada");

  const limite = usd ? conf?.monto_aprobacion_usd : conf?.monto_aprobacion;
  const aprobacion = limite != null && monto >= Number(limite);
  const { data: fila, error: eIns } = await ctx.sb
    .from("cobre_transferencias")
    .insert({
      modo: ctx.conexion.modo,
      id_txn: idTxn,
      transaction_id: r.transaction_id ?? null,
      cliente_legajo: legajo,
      subcuenta_id: subcuentaId,
      contraparte_id: cp.id,
      cuenta_origen_externa_id: origen,
      monto,
      concepto,
      tipo: usd ? cp.rail : "spei",
      moneda: usd ? "USD" : "MXN",
      requiere_aprobacion: aprobacion,
      estado: aprobacion ? "pendiente_aprobacion" : "enviando",
      instancia_id: ctx.conexion.instanciaId,
    })
    .select("*")
    .single();
  if (eIns) throw new HttpError(500, eIns.message);
  const extra = { comision: r.comision ?? 0, impuesto: r.impuesto ?? 0 };
  if (aprobacion) return { ...fila, ...extra };

  // 2) Envío a Cobre.
  if (usd) await iniciarEnvioUsd(ctx.sb, ctx.conexion, fila);
  else await enviarSpei(ctx.sb, ctx.conexion, fila, cp.contraparte_externa_id);
  const { data: final } = await ctx.sb
    .from("cobre_transferencias")
    .select("*")
    .eq("id", fila.id)
    .single();
  return { ...final, ...extra };
}

/** Manda un SPEI ya reservado. Sin respuesta clara queda `enviando` (lo resuelven los pendientes). */
async function enviarSpei(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  fila: Obj,
  contraparte: string,
) {
  const idTxn = String(fila.id_txn);
  let mm: Obj;
  try {
    mm = await conexion.cliente.post<Obj>(
      "/money_movements",
      transferenciaSpei({
        cuentaOrigen: String(fila.cuenta_origen_externa_id),
        contraparte,
        monto: Number(fila.monto),
        concepto: String(fila.concepto ?? "Transferencia"),
        referencia: referenciaNumerica(idTxn),
        externalId: idTxn,
      }),
      idTxn,
    );
  } catch (e) {
    if (
      e instanceof CobreError &&
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 408 &&
      e.status !== 429
    ) {
      // Cobre la rechazó al validar: no salió dinero → se libera la reserva.
      await sb.rpc("cancelar_transferencia_bdc", { p_origin_id: idTxn, p_motivo: e.message });
      await sb
        .from("cobre_transferencias")
        .update({
          estado: "error_envio",
          codigo: e.codigo,
          motivo: e.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fila.id);
      throw e;
    }
    return; // queda `enviando`: la revisión de pendientes consulta por external_id
  }
  const s = resumirTransferencia(mm);
  await sb
    .from("cobre_transferencias")
    .update({ mm_id: s.id, estado: "pendiente", updated_at: new Date().toISOString() })
    .eq("id", fila.id);
  if (SIN_DEBITO.includes(s.estado) || s.estado === "completada") {
    await aplicarEstadoTransferencia(
      sb,
      { id: String(fila.id), id_txn: idTxn, estado: "pendiente", mm_id: s.id },
      mm,
    );
  }
}

// ── Lote ─────────────────────────────────────────────────────────────────────

async function lote(ctx: Ctx, legajo: string, b: Body) {
  const idLote = String(b.id_lote ?? "").trim();
  if (!/^[A-Za-z0-9-]{9,30}$/.test(idLote)) throw new HttpError(400, "id_lote inválido");
  const subcuentaId = String(b.subcuenta_id ?? "");
  const items = Array.isArray(b.items) ? (b.items as Obj[]) : [];
  if (!items.length) throw new HttpError(400, "El lote no tiene envíos");
  if (items.length > MAX_ITEMS_LOTE)
    throw new HttpError(400, `Máximo ${MAX_ITEMS_LOTE} envíos por lote`);

  const { data: previo } = await ctx.sb
    .from("cobre_transferencias")
    .select("lote_id")
    .eq("id_txn", `${idLote}-1`)
    .maybeSingle();
  if (previo?.lote_id) {
    const { data } = await ctx.sb.from("cobre_lotes").select("*").eq("id", previo.lote_id).single();
    if (data?.cliente_legajo !== legajo)
      throw new HttpError(403, "El lote pertenece a otra cuenta");
    return data;
  }

  const { data: conf } = await ctx.sb
    .from("cobre_configuracion")
    .select("exigir_otp, monto_aprobacion")
    .eq("id", 1)
    .single();
  const ids = [...new Set(items.map((i) => String(i.contraparte_id ?? "")))];
  const { data: cps } = await ctx.sb
    .from("cobre_contrapartes")
    .select("id, tipo, numero, titular, banco, contraparte_externa_id, verificacion")
    .eq("cliente_legajo", legajo)
    .eq("modo", ctx.conexion.modo)
    .in("id", ids);
  const porId = new Map(((cps ?? []) as Obj[]).map((c) => [String(c.id), c]));
  let total = 0;
  items.forEach((it, i) => {
    const cp = porId.get(String(it.contraparte_id ?? ""));
    const monto = Number(it.monto);
    if (!cp) throw new HttpError(400, `Fila ${i + 1}: destinatario inexistente`);
    if (cp.tipo !== "clabe" || cp.verificacion !== "matched") {
      throw new HttpError(409, `Fila ${i + 1}: la CLABE de ${cp.titular} no está verificada`);
    }
    if (!(monto > 0) || Math.round(monto * 100) !== monto * 100)
      throw new HttpError(400, `Fila ${i + 1}: monto inválido`);
    total += monto;
  });
  if (conf?.exigir_otp) await verificarOtp(ctx, b.codigo);
  const origen = await balanceDelComercio(ctx, legajo);
  const aprobacion = conf?.monto_aprobacion != null && total >= Number(conf.monto_aprobacion);

  const { data: filaLote, error: eLote } = await ctx.sb
    .from("cobre_lotes")
    .insert({
      modo: ctx.conexion.modo,
      cliente_legajo: legajo,
      subcuenta_id: subcuentaId,
      archivo: `pendiente-${idLote}`,
      cantidad: items.length,
      total: Math.round(total * 100) / 100,
      requiere_aprobacion: aprobacion,
    })
    .select("*")
    .single();
  if (eLote) throw new HttpError(500, eLote.message);
  const archivo = nombreArchivoLote(filaLote.id);
  await ctx.sb.from("cobre_lotes").update({ archivo }).eq("id", filaLote.id);

  // Reserva de cada ítem; si alguno no pasa, se liberan los ya reservados y no se envía nada.
  const reservados: string[] = [];
  try {
    for (const [i, it] of items.entries()) {
      const cp = porId.get(String(it.contraparte_id))!;
      const idTxn = `${idLote}-${i + 1}`;
      const concepto = texto(it.concepto, 40) ?? "Pago";
      const r = await reservar(ctx, {
        subcuentaId,
        idTxn,
        destino: String(cp.numero),
        monto: Number(it.monto),
        concepto,
        titular: String(cp.titular),
        banco: (cp.banco as string | null) ?? null,
      });
      if (r.ok === false) throw new HttpError(409, `Fila ${i + 1}: ${r.motivo ?? "rechazada"}`);
      reservados.push(idTxn);
      const { error } = await ctx.sb.from("cobre_transferencias").insert({
        modo: ctx.conexion.modo,
        id_txn: idTxn,
        transaction_id: r.transaction_id ?? null,
        cliente_legajo: legajo,
        subcuenta_id: subcuentaId,
        contraparte_id: cp.id,
        cuenta_origen_externa_id: origen,
        monto: Number(it.monto),
        concepto,
        lote_id: filaLote.id,
        requiere_aprobacion: aprobacion,
        estado: aprobacion ? "pendiente_aprobacion" : "enviando",
        instancia_id: ctx.conexion.instanciaId,
      });
      if (error) throw new HttpError(500, error.message);
    }
  } catch (e) {
    for (const idTxn of reservados) {
      await ctx.sb.rpc("cancelar_transferencia_bdc", {
        p_origin_id: idTxn,
        p_motivo: "Lote cancelado",
      });
    }
    await ctx.sb
      .from("cobre_transferencias")
      .update({ estado: "cancelada", motivo: "Lote no enviado" })
      .eq("lote_id", filaLote.id);
    await ctx.sb
      .from("cobre_lotes")
      .update({ estado: "error_envio", motivo: (e as Error).message })
      .eq("id", filaLote.id);
    throw e;
  }
  if (!aprobacion) await subirLote(ctx.sb, ctx.conexion, filaLote.id);
  const { data } = await ctx.sb.from("cobre_lotes").select("*").eq("id", filaLote.id).single();
  return data;
}

/** Arma el archivo con los ítems reservados del lote y lo sube a Cobre. */
async function subirLote(sb: SupabaseClient, conexion: ConexionCobre, loteId: string) {
  const { data: l } = await sb.from("cobre_lotes").select("id, archivo").eq("id", loteId).single();
  const { data: ts } = await sb
    .from("cobre_transferencias")
    .select(
      "id_txn, monto, concepto, cuenta_origen_externa_id, cobre_contrapartes(contraparte_externa_id)",
    )
    .eq("lote_id", loteId)
    .order("id_txn");
  const items = ((ts ?? []) as Obj[]).map((t) => {
    const s = transferenciaSpei({
      cuentaOrigen: String(t.cuenta_origen_externa_id),
      contraparte: String((t.cobre_contrapartes as Obj).contraparte_externa_id),
      monto: Number(t.monto),
      concepto: String(t.concepto ?? "Pago"),
      referencia: referenciaNumerica(String(t.id_txn)),
      externalId: String(t.id_txn),
    });
    delete s.checker_approval;
    return s;
  });
  await enviarLote(sb, conexion, { id: loteId, archivo: String(l?.archivo) }, items);
}

// ── Consulta y aprobación ────────────────────────────────────────────────────

async function consultar(ctx: Ctx, legajo: string | null, b: Body) {
  let q = ctx.sb
    .from("cobre_transferencias")
    .select("*")
    .eq("id", String(b.transferencia_id ?? ""));
  if (legajo) q = q.eq("cliente_legajo", legajo);
  const { data: fila } = await q.maybeSingle();
  if (!fila) throw new HttpError(404, "Transferencia inexistente");
  const conexion = legajo ? ctx.conexion : await conexionDeCliente(ctx.sb, fila.cliente_legajo);
  if (fila.estado === "trasladando" && fila.traslado_mm_id) {
    await aplicarEstadoEnvioUsd(
      ctx.sb,
      conexion,
      await conexion.cliente.get(`/money_movements/${fila.traslado_mm_id}`),
    );
  } else if (fila.mm_id) {
    await aplicarEstadoTransferencia(
      ctx.sb,
      fila,
      await conexion.cliente.get(`/money_movements/${fila.mm_id}`),
    );
  }
  const { data } = await ctx.sb.from("cobre_transferencias").select("*").eq("id", fila.id).single();
  return data;
}

async function decidir(sb: SupabaseClient, req: Request, b: Body) {
  const aprobar = b.aprobar === true;
  const nota = texto(b.nota, 200) ?? (aprobar ? "Aprobada" : "Rechazada");
  const { data: u } = await sb.auth.getUser(bearerToken(req) ?? "");
  const quien = u?.user?.email ?? "admin";
  const ahora = new Date().toISOString();
  const decision = { decidida_por: quien, decidida_at: ahora, nota_decision: nota };

  if (typeof b.lote_id === "string") {
    const { data: l } = await sb.from("cobre_lotes").select("*").eq("id", b.lote_id).maybeSingle();
    if (!l) throw new HttpError(404, "Lote inexistente");
    if (!l.requiere_aprobacion || l.decidida_at || l.estado !== "preparando") {
      throw new HttpError(409, "El lote no está pendiente de aprobación");
    }
    await sb
      .from("cobre_lotes")
      .update({ ...decision, updated_at: ahora })
      .eq("id", l.id);
    if (aprobar) {
      await sb
        .from("cobre_transferencias")
        .update({ estado: "enviando", ...decision })
        .eq("lote_id", l.id);
      await subirLote(sb, await conexionDeCliente(sb, l.cliente_legajo), l.id);
    } else {
      const { data: ts } = await sb
        .from("cobre_transferencias")
        .select("id_txn")
        .eq("lote_id", l.id);
      for (const t of (ts ?? []) as { id_txn: string }[]) {
        await sb.rpc("cancelar_transferencia_bdc", { p_origin_id: t.id_txn, p_motivo: nota });
      }
      await sb
        .from("cobre_transferencias")
        .update({ estado: "cancelada", motivo: nota, ...decision })
        .eq("lote_id", l.id);
      await sb.from("cobre_lotes").update({ estado: "canceled", motivo: nota }).eq("id", l.id);
    }
    const { data } = await sb.from("cobre_lotes").select("*").eq("id", l.id).single();
    return data;
  }

  const { data: fila } = await sb
    .from("cobre_transferencias")
    .select("*, cobre_contrapartes(contraparte_externa_id)")
    .eq("id", String(b.transferencia_id ?? ""))
    .maybeSingle();
  if (!fila) throw new HttpError(404, "Transferencia inexistente");
  if (fila.estado !== "pendiente_aprobacion" || fila.mm_id || fila.lote_id) {
    throw new HttpError(409, "La transferencia no está pendiente de aprobación");
  }
  await sb.from("cobre_transferencias").update(decision).eq("id", fila.id);
  if (!aprobar) {
    await sb.rpc("cancelar_transferencia_bdc", { p_origin_id: fila.id_txn, p_motivo: nota });
    await sb
      .from("cobre_transferencias")
      .update({ estado: "cancelada", motivo: nota, updated_at: ahora })
      .eq("id", fila.id);
  } else {
    const conexion = await conexionDeCliente(sb, fila.cliente_legajo);
    await sb
      .from("cobre_transferencias")
      .update({ estado: "enviando", updated_at: ahora })
      .eq("id", fila.id);
    if (fila.moneda === "USD") await iniciarEnvioUsd(sb, conexion, { ...fila, estado: "enviando" });
    else
      await enviarSpei(
        sb,
        conexion,
        fila,
        (fila.cobre_contrapartes as Obj).contraparte_externa_id as string,
      );
  }
  const { data } = await sb.from("cobre_transferencias").select("*").eq("id", fila.id).single();
  return data;
}
