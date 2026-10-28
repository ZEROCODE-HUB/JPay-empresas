// Edge Function: transferencias SPEI por Cobre (Fase C4). Body: { accion, ... }.
//
// Cliente (su sesión):
// - `contraparte` { tipo, numero, banco?, titular, id_tipo, id_numero, alias?, verificar? }:
//   registra el destinatario en Cobre (o reusa el existente) y, si `verificar`, pide la
//   verificación de titularidad (asíncrona: matched / unmatched / unresolved).
// - `verificacion` { contraparte_id }: consulta el resultado de la verificación.
// - `enviar` { subcuenta_id, contraparte_id, monto, concepto?, id_txn, codigo? }: OTP (si
//   `cobre_configuracion.exigir_otp`) → reserva en el ledger (reservar_transferencia_bdc: reglas,
//   comisión, saldo) → money movement en Cobre (idempotencia = id_txn). Sobre
//   `monto_aprobacion` va con aprobación. Un error de validación de Cobre libera la reserva; sin
//   respuesta queda `enviando` y la revisión de pendientes lo resuelve (nunca se duplica).
// - `consultar` { transferencia_id }: trae el estado de Cobre y lo aplica.
// Admin:
// - `decidir` { transferencia_id, aprobar, nota }: manda la decisión de la aprobación a Cobre.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  CobreError,
  contraparteMx,
  referenciaNumerica,
  resumirTransferencia,
  SIN_DEBITO,
  transferenciaSpei,
  type CobreCliente,
  type ModoCobre,
} from "../_shared/cobre.ts";
import { conexionCobre } from "../_shared/cobre-servidor.ts";
import { aplicarEstadoTransferencia } from "../_shared/cobre-transferencias.ts";
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
type Ctx = { sb: SupabaseClient; cobre: CobreCliente; modo: ModoCobre; req: Request };

const texto = (v: unknown, max = 120) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    const { cliente: cobre, modo } = conexionCobre(sb);
    const ctx: Ctx = { sb, cobre, modo, req };
    try {
      switch (body.accion) {
        case "contraparte":
          return json(await registrarContraparte(ctx, await legajoDeSesion(req), body));
        case "verificacion":
          return json(await consultarVerificacion(ctx, await legajoDeSesion(req), body));
        case "enviar":
          return json(await enviar(ctx, await legajoDeSesion(req), body));
        case "consultar":
          return json(
            await consultar(ctx, (await esAdmin(req)) ? null : await legajoDeSesion(req), body),
          );
        case "decidir":
          if (!(await esAdmin(req))) throw new HttpError(403, "Solo para administradores");
          return json(await decidir(ctx, body));
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
    .eq("modo", ctx.modo)
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
    const cp = await ctx.cobre.post<{ id: string }>("/counterparties", cuerpo);
    const { data, error } = await ctx.sb
      .from("cobre_contrapartes")
      .insert({
        cliente_legajo: legajo,
        modo: ctx.modo,
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

  if (b.verificar === true && tipo === "clabe" && fila.verificacion === "sin_verificar") {
    const av = await ctx.cobre.post<{ id: string }>("/account_verifications", {
      model: "mex_acc_ownership_1",
      account_number: numero,
      account_type: "clabe",
      account_holder_id_type: idTipo,
      account_holder_id_number: idNumero,
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

async function consultarVerificacion(ctx: Ctx, legajo: string, b: Body) {
  const { data: cp } = await ctx.sb
    .from("cobre_contrapartes")
    .select("*")
    .eq("id", String(b.contraparte_id ?? ""))
    .eq("cliente_legajo", legajo)
    .maybeSingle();
  if (!cp) throw new HttpError(404, "Destinatario inexistente");
  if (cp.verificacion !== "procesando" || !cp.verificacion_externa_id) return cp;
  const av = await ctx.cobre.get<{ status?: string; verification_response?: string }>(
    `/account_verifications/${cp.verificacion_externa_id}`,
  );
  const r = av?.verification_response;
  if (r !== "matched" && r !== "unmatched" && r !== "unresolved") return cp;
  const { data, error } = await ctx.sb
    .from("cobre_contrapartes")
    .update({ verificacion: r, verificado_at: new Date().toISOString() })
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

  const { data: conf } = await ctx.sb
    .from("cobre_configuracion")
    .select("exigir_otp, monto_aprobacion")
    .eq("id", 1)
    .single();
  if (conf?.exigir_otp) await verificarOtp(ctx, b.codigo);

  const [{ data: cp }, { data: clabe }] = await Promise.all([
    ctx.sb
      .from("cobre_contrapartes")
      .select("id, numero, titular, banco, id_numero, contraparte_externa_id, verificacion")
      .eq("id", String(b.contraparte_id ?? ""))
      .eq("cliente_legajo", legajo)
      .eq("modo", ctx.modo)
      .maybeSingle(),
    ctx.sb
      .from("cobre_clabes")
      .select("cuenta_id, cobre_cuentas(cuenta_externa_id)")
      .eq("subcuenta_id", subcuentaId)
      .eq("cliente_legajo", legajo)
      .eq("modo", ctx.modo)
      .eq("estado", "activa")
      .maybeSingle(),
  ]);
  if (!cp) throw new HttpError(404, "Destinatario inexistente");
  if (cp.verificacion === "unmatched") {
    throw new HttpError(409, "La cuenta del destinatario no coincide con su RFC/CURP");
  }
  const origen = (clabe?.cobre_cuentas as unknown as { cuenta_externa_id: string } | null)
    ?.cuenta_externa_id;
  if (!origen) throw new HttpError(409, "La subcuenta no tiene CLABE de Cobre");

  // 1) Reserva (con la sesión del cliente: valida dueño, reglas, comisión y saldo).
  const { data: reserva, error: eRes } = await userClient(ctx.req).rpc(
    "reservar_transferencia_bdc",
    {
      p_subcuenta_origen: subcuentaId,
      p_origin_id: idTxn,
      p_destinatario_cbu: cp.numero,
      p_monto: monto,
      p_concepto: concepto,
      p_destinatario_nombre: cp.titular,
      p_destinatario_banco: cp.banco ?? undefined,
    },
  );
  if (eRes) throw new HttpError(400, eRes.message);
  const r = reserva as {
    ok: boolean;
    motivo?: string;
    transaction_id?: string;
    comision?: number;
    impuesto?: number;
  };
  if (r.ok === false) throw new HttpError(409, r.motivo ?? "La transferencia fue rechazada");

  const aprobacion = conf?.monto_aprobacion != null && monto >= Number(conf.monto_aprobacion);
  const { data: fila, error: eIns } = await ctx.sb
    .from("cobre_transferencias")
    .insert({
      modo: ctx.modo,
      id_txn: idTxn,
      transaction_id: r.transaction_id ?? null,
      cliente_legajo: legajo,
      subcuenta_id: subcuentaId,
      contraparte_id: cp.id,
      cuenta_origen_externa_id: origen,
      monto,
      concepto,
      requiere_aprobacion: aprobacion,
    })
    .select("*")
    .single();
  if (eIns) throw new HttpError(500, eIns.message);

  // 2) Envío a Cobre.
  let mm: Record<string, unknown>;
  try {
    mm = await ctx.cobre.post<Record<string, unknown>>(
      "/money_movements",
      transferenciaSpei({
        cuentaOrigen: origen,
        contraparte: cp.contraparte_externa_id,
        monto,
        concepto,
        referencia: referenciaNumerica(idTxn),
        externalId: idTxn,
        aprobacion,
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
      await ctx.sb.rpc("cancelar_transferencia_bdc", { p_origin_id: idTxn, p_motivo: e.message });
      await ctx.sb
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
    // Sin respuesta clara: queda `enviando` y la revisión de pendientes consulta por external_id.
    return { ...fila, aviso: "Cobre no respondió; la transferencia se confirmará en unos minutos" };
  }

  const s = resumirTransferencia(mm);
  await ctx.sb
    .from("cobre_transferencias")
    .update({
      mm_id: s.id,
      estado: s.estado,
      aprobacion_externa_id:
        typeof mm.mm_approval_id === "string" && mm.mm_approval_id ? mm.mm_approval_id : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fila.id);
  if (SIN_DEBITO.includes(s.estado) || s.estado === "completada") {
    await aplicarEstadoTransferencia(ctx.sb, { ...fila, estado: "enviando", mm_id: s.id }, mm);
  }
  const { data: final } = await ctx.sb
    .from("cobre_transferencias")
    .select("*")
    .eq("id", fila.id)
    .single();
  return { ...final, comision: r.comision ?? 0, impuesto: r.impuesto ?? 0 };
}

async function consultar(ctx: Ctx, legajo: string | null, b: Body) {
  let q = ctx.sb
    .from("cobre_transferencias")
    .select("*")
    .eq("id", String(b.transferencia_id ?? ""));
  if (legajo) q = q.eq("cliente_legajo", legajo);
  const { data: fila } = await q.maybeSingle();
  if (!fila) throw new HttpError(404, "Transferencia inexistente");
  if (!fila.mm_id) return fila;
  const mm = await ctx.cobre.get(`/money_movements/${fila.mm_id}`);
  await aplicarEstadoTransferencia(ctx.sb, fila, mm);
  const { data } = await ctx.sb.from("cobre_transferencias").select("*").eq("id", fila.id).single();
  return data;
}

async function decidir(ctx: Ctx, b: Body) {
  const { data: fila } = await ctx.sb
    .from("cobre_transferencias")
    .select("*")
    .eq("id", String(b.transferencia_id ?? ""))
    .maybeSingle();
  if (!fila) throw new HttpError(404, "Transferencia inexistente");
  if (fila.estado !== "pendiente_aprobacion" || !fila.aprobacion_externa_id) {
    throw new HttpError(409, "La transferencia no está pendiente de aprobación");
  }
  const nota = texto(b.nota, 200) ?? (b.aprobar === true ? "Aprobada" : "Rechazada");
  const { data: u } = await ctx.sb.auth.getUser(bearerToken(ctx.req) ?? "");
  const quien = u?.user?.email ?? "admin";
  await ctx.cobre.post(`/money_movement_approvals/${fila.aprobacion_externa_id}/decision`, {
    decision: b.aprobar === true ? "approved" : "denied",
    description: nota,
    approvers: [quien],
  });
  await ctx.sb
    .from("cobre_transferencias")
    .update({ decidida_por: quien, decidida_at: new Date().toISOString(), nota_decision: nota })
    .eq("id", fila.id);
  return await consultar(ctx, null, { transferencia_id: fila.id });
}
