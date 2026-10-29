// Cobros Direct Link R2P SPEI (Solution Design §4.2): contraparte `r2p_spei` del pagador →
// money movement `r2p_spei` hacia el Cobre Balance del comercio → CLABE dinámica de un solo uso
// (`metadata.virtual_account`) con vencimiento. Se acredita con `money_movements.status.completed`
// + crédito `r2p_spei_credit` (conciliado por `mm_external_id`).
// Lo usan `cobre-r2p` (crear y consultar), `cobre-webhook`, la conciliación y los pendientes.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  aCentavos,
  CobreError,
  resumirTransferencia,
  transaccionCobre,
  type ModoCobre,
} from "./cobre.ts";
import type { ConexionCobre } from "./cobre-servidor.ts";

type Obj = Record<string, unknown>;

export type Pagador = {
  nombre: string;
  idTipo: "rfc" | "curp";
  idNumero: string;
  correo?: string | null;
};

/** Códigos con los que el pagador puede volver a intentar (se emite un cobro nuevo). */
export const CODIGOS_REINTENTO_R2P = ["F003", "R012", "R016", "R017", "R019", "R020", "R021"];

const limpiar = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Cuerpo de POST /counterparties para el pagador de un R2P (geo `mex`, tipo `r2p_spei`). */
export function contraparteR2p(p: Pagador): Obj {
  const nombre = limpiar(p.nombre);
  if (!nombre) throw new CobreError(400, "Falta el nombre del pagador");
  const id = p.idNumero.trim().toUpperCase();
  if (!/^[A-Z0-9&Ñ]{10,18}$/.test(id)) throw new CobreError(400, "RFC o CURP del pagador inválido");
  return {
    geo: "mex",
    type: "r2p_spei",
    alias: nombre.slice(0, 32),
    metadata: {
      counterparty_fullname: nombre,
      counterparty_id_type: p.idTipo,
      counterparty_id_number: id,
      counterparty_email: p.correo?.trim() ?? "",
      counterparty_phone: "",
      counterparty_address: "",
    },
  };
}

/** Cuerpo de POST /money_movements para el R2P (sin `type`: lo da la contraparte). */
export function movimientoR2p(o: {
  contraparte: string;
  cuentaDestino: string;
  monto: number;
  concepto: string;
  validoHasta: Date;
  externalId: string;
}): Obj {
  if (!(o.monto > 0)) throw new CobreError(400, "Monto inválido");
  return {
    amount: aCentavos(o.monto),
    source_id: o.contraparte,
    destination_id: o.cuentaDestino,
    metadata: {
      r2p_rail: "spei",
      description_to_payer: o.concepto.slice(0, 256),
      description_to_payee: o.concepto.slice(0, 256),
      valid_until: o.validoHasta.toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
    external_id: o.externalId,
  };
}

export const nuevoExternalR2p = () =>
  `R2P${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

type FilaCobro = Obj & { id: string; external_id: string; estado: string };

/**
 * Emite el cobro en Cobre. La fila ya existe (estado `creando`) con su `external_id`, que es
 * también la clave de idempotencia: un reintento manda el mismo encabezado y nunca duplica.
 */
export async function emitirCobroR2p(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  fila: FilaCobro,
): Promise<FilaCobro> {
  let cp = fila.contraparte_externa_id as string | null;
  if (!cp) {
    const r = await conexion.cliente.post<{ id: string }>(
      "/counterparties",
      contraparteR2p({
        nombre: String(fila.pagador_nombre),
        idTipo: fila.pagador_id_tipo === "curp" ? "curp" : "rfc",
        idNumero: String(fila.pagador_id_numero),
        correo: (fila.pagador_correo as string | null) ?? null,
      }),
    );
    cp = r.id;
    await sb.from("cobre_cobros_r2p").update({ contraparte_externa_id: cp }).eq("id", fila.id);
  }
  let mm: Obj;
  try {
    mm = await conexion.cliente.post<Obj>(
      "/money_movements",
      movimientoR2p({
        contraparte: cp,
        cuentaDestino: String(fila.cuenta_destino_externa_id),
        monto: Number(fila.monto),
        concepto: String(fila.concepto ?? "Cobro JPay"),
        validoHasta: new Date(String(fila.valido_hasta)),
        externalId: fila.external_id,
      }),
      fila.external_id,
    );
  } catch (e) {
    if (
      e instanceof CobreError &&
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 408 &&
      e.status !== 429
    ) {
      await sb
        .from("cobre_cobros_r2p")
        .update({
          estado: "error_envio",
          codigo: e.codigo,
          motivo: e.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fila.id);
    }
    throw e;
  }
  const meta = (mm.metadata ?? {}) as Obj;
  const clabe = typeof meta.virtual_account === "string" ? meta.virtual_account : null;
  const { data, error } = await sb
    .from("cobre_cobros_r2p")
    .update({
      mm_id: typeof mm.id === "string" ? mm.id : null,
      clabe_dinamica: clabe,
      estado: "pendiente",
      ...(typeof meta.valid_until === "string" ? { valido_hasta: meta.valid_until } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", fila.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await aplicarEstadoCobroR2p(sb, conexion.modo, mm);
  return data as FilaCobro;
}

async function cobroPor(
  sb: SupabaseClient,
  modo: ModoCobre,
  mmId: string | null,
  externalId: string | null,
) {
  const mm = (mmId ?? "").replace(/[^\w-]/g, "");
  const ext = (externalId ?? "").replace(/[^\w-]/g, "");
  if (!mm && !ext) return null;
  const { data } = await sb
    .from("cobre_cobros_r2p")
    .select("*")
    .eq("modo", modo)
    .or(`mm_id.eq.${mm || "-"},external_id.eq.${ext || "-"}`)
    .limit(1)
    .maybeSingle();
  return data as FilaCobro | null;
}

/** Estado del money movement `r2p_spei`. `completed` espera el crédito para acreditar. */
export async function aplicarEstadoCobroR2p(
  sb: SupabaseClient,
  modo: ModoCobre,
  mm: unknown,
): Promise<string> {
  const r = resumirTransferencia(mm);
  const fila = await cobroPor(sb, modo, r.id || null, r.externalId);
  if (!fila) return "desconocido";
  if (["pagado", "vencido", "rechazado", "fallido"].includes(fila.estado)) return fila.estado;
  let estado = fila.estado;
  if (r.estado === "completada")
    estado = "pendiente"; // lo cierra el crédito r2p_spei_credit
  else if (r.estado === "rechazada")
    estado = r.codigo === "F003" || r.codigo === "R017" || !r.codigo ? "vencido" : "rechazado";
  else if (r.estado === "fallida" || r.estado === "cancelada")
    estado = r.codigo === "F003" || r.codigo === "R017" ? "vencido" : "fallido";
  else if (r.estado === "pendiente") estado = "pendiente";
  const { error } = await sb
    .from("cobre_cobros_r2p")
    .update({
      estado,
      mm_id: fila.mm_id ?? (r.id || null),
      codigo: r.codigo,
      motivo: r.motivo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fila.id);
  if (error) throw new Error(error.message);
  if (estado !== fila.estado && fila.pago_id) await actualizarPago(sb, fila, estado);
  return r.estado === "completada" ? "completado (esperando el crédito)" : estado;
}

/** Crédito `r2p_spei_credit`: acredita en la subcuenta del cobro (una sola vez). */
export async function acreditarCobroR2p(
  sb: SupabaseClient,
  modo: ModoCobre,
  trx: unknown,
): Promise<string> {
  const t = transaccionCobre(trx);
  const meta = (((trx ?? {}) as Obj).metadata ?? {}) as Obj;
  const fila = await cobroPor(sb, modo, t.mmId, t.mmExternalId);
  const s = (v: unknown) => (typeof v === "string" && v && v !== "N/A" ? v : undefined);
  const { data, error } = await sb.rpc("cobre_registrar_deposito", {
    p_modo: modo,
    p_transaccion_id: t.id,
    p_cuenta_externa_id: t.cuentaId ?? undefined,
    p_clabe: s(meta.account_reference),
    p_monto: Math.abs(t.monto),
    p_remitente: s(meta.sender_name),
    p_remitente_cuenta: s(meta.sender_account_number),
    p_remitente_id: s(meta.sender_id),
    p_clave_rastreo: s(meta.tracking_key),
    p_cep: s(meta.cep),
    p_fecha: t.fecha ?? undefined,
    p_subcuenta_id: (fila?.subcuenta_id as string | undefined) ?? undefined,
    p_origen: "r2p",
  });
  if (error) throw new Error(error.message);
  const r = data as { estado?: string; transaction_id?: string } | null;
  if (!fila) return `sin cobro en JPay (depósito ${r?.estado ?? "?"})`;
  if (fila.estado !== "pagado") {
    const ahora = new Date().toISOString();
    await sb
      .from("cobre_cobros_r2p")
      .update({
        estado: "pagado",
        transaccion_externa_id: t.id,
        transaction_id: r?.transaction_id ?? null,
        pagado_at: t.fecha ?? ahora,
        updated_at: ahora,
      })
      .eq("id", fila.id);
    if (fila.pago_id) await actualizarPago(sb, fila, "pagado");
  }
  return `pagado (${r?.estado ?? "?"})`;
}

/** Refleja el estado del cobro en el pago del link (checkout), si vino de uno. */
async function actualizarPago(sb: SupabaseClient, fila: FilaCobro, estado: string) {
  const mapa: Record<string, string> = {
    pagado: "pagado",
    vencido: "cancelado",
    rechazado: "rechazado",
    fallido: "rechazado",
  };
  const nuevo = mapa[estado];
  if (!nuevo) return;
  const { error } = await sb.rpc("aplicar_estado_pago", {
    p_pago_id: fila.pago_id as string,
    p_estado: nuevo,
    p_estado_proveedor: estado,
    p_motivo: (fila.motivo as string | null) ?? undefined,
    p_metodo: "spei_cobre",
    p_proveedor_pago_id: (fila.mm_id as string | null) ?? undefined,
  });
  if (error) throw new Error(`No se pudo actualizar el pago del link: ${error.message}`);
}
