import { requireSupabase } from "@/lib/supabase";
import { DataAccessError } from "./errors";
import { legajoSesion, SALDOS_EMBED, conSaldos } from "./subcuentas";

/**
 * Cuenta y transferencias SPEI con Cobre (México). Lecturas por RLS (solo lo del cliente);
 * las altas y los envíos pasan por las Edge Functions `cobre-cuentas` y `cobre-transferencias`.
 */

export type SubcuentaSpei = {
  id: string;
  nombre: string;
  tipo: string;
  saldoDisponible: number;
  saldoRetenido: number;
  clabe: string | null;
};

export type DestinatarioSpei = {
  id: string;
  tipo: "clabe" | "spei_card";
  numero: string;
  titular: string;
  idTipo: "rfc" | "curp";
  idNumero: string;
  alias: string | null;
  verificacion: "sin_verificar" | "procesando" | "matched" | "unmatched" | "unresolved";
};

export type EstadoSpei =
  | "enviando"
  | "pendiente"
  | "pendiente_aprobacion"
  | "completada"
  | "rechazada"
  | "fallida"
  | "cancelada"
  | "error_envio";

export type TransferenciaSpei = {
  id: string;
  idTxn: string;
  monto: number;
  concepto: string | null;
  estado: EstadoSpei;
  motivo: string | null;
  claveRastreo: string | null;
  cep: string | null;
  requiereAprobacion: boolean;
  destinatario: string | null;
  creadaAt: string;
};

export type DepositoSpei = {
  id: string;
  monto: number;
  remitente: string | null;
  clabe: string | null;
  claveRastreo: string | null;
  estado: string;
  recibidoAt: string;
};

async function invocar<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<T>(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo = ctx ? await ctx.json().catch(() => null) : null;
    throw new DataAccessError(cuerpo?.error ? new Error(cuerpo.error) : error);
  }
  if (data == null) throw new DataAccessError(new Error("Respuesta vacía"));
  return data;
}

/** Subcuentas del cliente con saldo y su CLABE de Cobre (si tiene). */
export async function listSubcuentasSpei(): Promise<SubcuentaSpei[]> {
  const sb = requireSupabase();
  const legajo = await legajoSesion();
  if (!legajo) return [];
  const [{ data: subs, error }, { data: clabes, error: e2 }] = await Promise.all([
    sb
      .from("subaccounts")
      .select(`id, nombre, tipo, ${SALDOS_EMBED}`)
      .eq("cliente_legajo", legajo)
      .order("nombre"),
    sb.from("cobre_clabes").select("subcuenta_id, clabe").eq("estado", "activa"),
  ]);
  if (error) throw new DataAccessError(error);
  if (e2) throw new DataAccessError(e2);
  const porSub = new Map((clabes ?? []).map((c) => [c.subcuenta_id, c.clabe]));
  return (subs ?? []).map((s) => {
    const x = conSaldos(s);
    return {
      id: x.id,
      nombre: x.nombre,
      tipo: x.tipo,
      saldoDisponible: x.saldo_disponible,
      saldoRetenido: x.saldo_retenido,
      clabe: porSub.get(x.id) ?? null,
    };
  });
}

export async function generarClabe(subcuentaId: string): Promise<{ clabe: string }> {
  return invocar("cobre-cuentas", { accion: "asignar_clabe", subcuenta_id: subcuentaId });
}

export async function listDestinatariosSpei(): Promise<DestinatarioSpei[]> {
  const sb = requireSupabase();
  const { data: rows, error } = await sb
    .from("cobre_contrapartes")
    .select("id, tipo, numero, titular, id_tipo, id_numero, alias, verificacion")
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error);
  return (rows ?? []).map((r) => ({
    id: r.id,
    tipo: r.tipo as DestinatarioSpei["tipo"],
    numero: r.numero,
    titular: r.titular,
    idTipo: r.id_tipo as DestinatarioSpei["idTipo"],
    idNumero: r.id_numero,
    alias: r.alias,
    verificacion: r.verificacion as DestinatarioSpei["verificacion"],
  }));
}

export async function crearDestinatarioSpei(d: {
  numero: string;
  titular: string;
  idTipo: "rfc" | "curp";
  idNumero: string;
  alias?: string;
  verificar: boolean;
}): Promise<{ id: string }> {
  return invocar("cobre-transferencias", {
    accion: "contraparte",
    tipo: "clabe",
    numero: d.numero,
    titular: d.titular,
    id_tipo: d.idTipo,
    id_numero: d.idNumero,
    alias: d.alias,
    verificar: d.verificar,
  });
}

export async function enviarTransferenciaSpei(t: {
  subcuentaId: string;
  destinatarioId: string;
  monto: number;
  concepto: string;
  idTxn: string;
  codigo?: string;
}): Promise<{ id: string; estado: EstadoSpei; id_txn: string; aviso?: string }> {
  return invocar("cobre-transferencias", {
    accion: "enviar",
    subcuenta_id: t.subcuentaId,
    contraparte_id: t.destinatarioId,
    monto: t.monto,
    concepto: t.concepto,
    id_txn: t.idTxn,
    codigo: t.codigo,
  });
}

/** TXID de un envío: se genera una vez por intento (reintentar con el mismo no duplica). */
export const nuevoTxid = () =>
  `CBT${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export async function listTransferenciasSpei(limite = 50): Promise<TransferenciaSpei[]> {
  const sb = requireSupabase();
  const { data: rows, error } = await sb
    .from("cobre_transferencias")
    .select(
      "id, id_txn, monto, concepto, estado, motivo, clave_rastreo, cep, requiere_aprobacion, created_at, cobre_contrapartes(titular, numero)",
    )
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new DataAccessError(error);
  return (rows ?? []).map((r) => {
    const cp = r.cobre_contrapartes as unknown as { titular: string; numero: string } | null;
    return {
      id: r.id,
      idTxn: r.id_txn,
      monto: Number(r.monto),
      concepto: r.concepto,
      estado: r.estado as EstadoSpei,
      motivo: r.motivo,
      claveRastreo: r.clave_rastreo,
      cep: r.cep,
      requiereAprobacion: r.requiere_aprobacion,
      destinatario: cp ? `${cp.titular} · ${cp.numero.slice(-4)}` : null,
      creadaAt: r.created_at,
    };
  });
}

export async function listDepositosSpei(limite = 50): Promise<DepositoSpei[]> {
  const sb = requireSupabase();
  const { data: rows, error } = await sb
    .from("cobre_depositos")
    .select("id, monto, remitente, clabe, clave_rastreo, estado, recibido_at")
    .order("recibido_at", { ascending: false })
    .limit(limite);
  if (error) throw new DataAccessError(error);
  return (rows ?? []).map((r) => ({
    id: r.id,
    monto: Number(r.monto),
    remitente: r.remitente,
    clabe: r.clabe,
    claveRastreo: r.clave_rastreo,
    estado: r.estado,
    recibidoAt: r.recibido_at,
  }));
}
