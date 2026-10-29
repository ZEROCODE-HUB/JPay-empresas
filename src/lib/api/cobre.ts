import { requireSupabase } from "@/lib/supabase";
import type { PersonaKyb } from "@/shared/cobre-kyb";
import type { EmpresaKyb } from "@/shared/ui/kyb-cobre";
import { DataAccessError } from "./errors";
import { legajoSesion, SALDOS_EMBED, conSaldos } from "./subcuentas";

/**
 * Cobre (México), según el Solution Design de JPAY: el comercio tiene su Cobre Balance (alta como
 * Subcliente) con su CLABE; cobra por SPEI con CLABE dinámica (R2P), paga por SPEI (uno a uno o en
 * lote), convierte pesos a dólares y paga en dólares (Fedwire / SWIFT). Lecturas por RLS (solo lo
 * del cliente); las altas y los envíos pasan por las Edge Functions `cobre-*`.
 */

export type SubcuentaSpei = {
  id: string;
  nombre: string;
  tipo: string;
  moneda: "MXN" | "USD";
  saldoDisponible: number;
  saldoRetenido: number;
  clabe: string | null;
};

export type Verificacion =
  | "sin_verificar"
  | "procesando"
  | "matched"
  | "unmatched"
  | "unresolved"
  | "verified"
  | "rejected"
  | "failed";

export type DestinatarioSpei = {
  id: string;
  tipo: "clabe" | "spei_card" | "business";
  rail: "fedwire" | "swift" | null;
  numero: string;
  banco: string | null;
  titular: string;
  idTipo: string;
  idNumero: string;
  alias: string | null;
  verificacion: Verificacion;
  motivoVerificacion: string | null;
};

export type EstadoSpei =
  | "enviando"
  | "pendiente"
  | "pendiente_aprobacion"
  | "trasladando"
  | "completada"
  | "rechazada"
  | "fallida"
  | "cancelada"
  | "error_envio"
  | "devuelta";

export type TransferenciaSpei = {
  id: string;
  idTxn: string;
  tipo: "spei" | "fedwire" | "swift";
  moneda: "MXN" | "USD";
  monto: number;
  concepto: string | null;
  estado: EstadoSpei;
  motivo: string | null;
  claveRastreo: string | null;
  cep: string | null;
  swiftUetr: string | null;
  requiereAprobacion: boolean;
  loteId: string | null;
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
  origen: "spei" | "r2p";
  recibidoAt: string;
};

export type CuentaCobre = {
  modo: string;
  instanciaPropia: boolean;
  faltan: string[];
  alta: { estado: string; motivo: string | null; created_at: string } | null;
  cuenta: {
    cuenta_externa_id: string;
    clabe: string | null;
    conectividad: string | null;
    subcuenta_id: string | null;
  } | null;
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

// ── Cuenta del comercio en Cobre ─────────────────────────────────────────────

/** Estado del alta del comercio (Subcliente) y su Cobre Balance. */
export const getCuentaCobre = () => invocar<CuentaCobre>("cobre-subclientes", { accion: "estado" });

/** Mueve la CLABE del Balance a otra subcuenta en pesos. */
export const cambiarSubcuentaReceptora = (subcuentaId: string) =>
  invocar<{ subcuenta_id: string; clabe: string }>("cobre-cuentas", {
    accion: "receptora",
    subcuenta_id: subcuentaId,
  });

/** Subcuentas del cliente con saldo, moneda y la CLABE del Balance (la tiene la receptora). */
export async function listSubcuentasSpei(): Promise<SubcuentaSpei[]> {
  const sb = requireSupabase();
  const legajo = await legajoSesion();
  if (!legajo) return [];
  const [{ data: subs, error }, { data: clabes, error: e2 }] = await Promise.all([
    sb
      .from("subaccounts")
      .select(`id, nombre, tipo, moneda, estado, ${SALDOS_EMBED}`)
      .eq("cliente_legajo", legajo)
      .eq("estado", "Activa")
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
      moneda: (s as { moneda: string | null }).moneda === "USD" ? "USD" : "MXN",
      saldoDisponible: x.saldo_disponible,
      saldoRetenido: x.saldo_retenido,
      clabe: porSub.get(x.id) ?? null,
    };
  });
}

// ── Datos KYB (alta como Subcliente) ─────────────────────────────────────────

export type DatosKyb = { legajo: string; empresa: EmpresaKyb; personas: PersonaKyb[] };

const aPersona = (r: Record<string, unknown>): PersonaKyb => ({
  id: String(r.id),
  rol: r.rol === "beneficiario" ? "beneficiario" : "representante",
  nombre: String(r.nombre),
  apellido: String(r.apellido),
  idTipo: r.id_tipo === "curp" ? "curp" : "rfc",
  idNumero: String(r.id_numero),
  nacionalidades: (r.nacionalidades as string[]) ?? [],
  fechaNacimiento: String(r.fecha_nacimiento),
  porcentaje: r.porcentaje == null ? null : Number(r.porcentaje),
});

export async function getDatosKyb(): Promise<DatosKyb | null> {
  const sb = requireSupabase();
  const legajo = await legajoSesion();
  if (!legajo) return null;
  const [{ data: c, error }, { data: personas, error: e2 }] = await Promise.all([
    sb
      .from("clientes")
      .select("telefono, sitio_web, industria_cobre, pais_constitucion, pais_operacion")
      .eq("legajo", legajo)
      .single(),
    sb.from("cliente_personas_kyb").select("*").eq("cliente_legajo", legajo).order("created_at"),
  ]);
  if (error) throw new DataAccessError(error);
  if (e2) throw new DataAccessError(e2);
  return {
    legajo,
    empresa: {
      telefono: c.telefono ?? "",
      sitioWeb: c.sitio_web ?? "",
      industria: c.industria_cobre ?? "",
      paisConstitucion: c.pais_constitucion ?? "MEX",
      paisOperacion: c.pais_operacion ?? "MEX",
    },
    personas: (personas ?? []).map((p) => aPersona(p as Record<string, unknown>)),
  };
}

export async function guardarEmpresaKyb(legajo: string, e: EmpresaKyb): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from("clientes")
    .update({
      telefono: e.telefono,
      sitio_web: e.sitioWeb,
      industria_cobre: e.industria,
      pais_constitucion: e.paisConstitucion,
      pais_operacion: e.paisOperacion,
    })
    .eq("legajo", legajo);
  if (error) throw new DataAccessError(error);
}

export async function guardarPersonaKyb(legajo: string, p: PersonaKyb): Promise<void> {
  const sb = requireSupabase();
  const fila = {
    cliente_legajo: legajo,
    rol: p.rol,
    nombre: p.nombre.trim(),
    apellido: p.apellido.trim(),
    id_tipo: p.idTipo,
    id_numero: p.idNumero.trim().toUpperCase(),
    nacionalidades: p.nacionalidades,
    fecha_nacimiento: p.fechaNacimiento,
    porcentaje: p.porcentaje,
    updated_at: new Date().toISOString(),
  };
  const { error } = p.id
    ? await sb.from("cliente_personas_kyb").update(fila).eq("id", p.id)
    : await sb.from("cliente_personas_kyb").insert(fila);
  if (error) throw new DataAccessError(error);
}

export async function borrarPersonaKyb(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("cliente_personas_kyb").delete().eq("id", id);
  if (error) throw new DataAccessError(error);
}

// ── Destinatarios ────────────────────────────────────────────────────────────

export async function listDestinatariosSpei(): Promise<DestinatarioSpei[]> {
  const sb = requireSupabase();
  const { data: rows, error } = await sb
    .from("cobre_contrapartes")
    .select(
      "id, tipo, rail, numero, banco, titular, id_tipo, id_numero, alias, verificacion, verificacion_motivo",
    )
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error);
  return (rows ?? []).map((r) => ({
    id: r.id,
    tipo: r.tipo as DestinatarioSpei["tipo"],
    rail: (r.rail as DestinatarioSpei["rail"]) ?? null,
    numero: r.numero,
    banco: r.banco,
    titular: r.titular,
    idTipo: r.id_tipo,
    idNumero: r.id_numero,
    alias: r.alias,
    verificacion: r.verificacion as Verificacion,
    motivoVerificacion: r.verificacion_motivo,
  }));
}

export async function crearDestinatarioSpei(d: {
  numero: string;
  titular: string;
  idTipo: "rfc" | "curp";
  idNumero: string;
  alias?: string;
}): Promise<{ id: string; verificacion: Verificacion }> {
  return invocar("cobre-transferencias", {
    accion: "contraparte",
    tipo: "clabe",
    numero: d.numero,
    titular: d.titular,
    id_tipo: d.idTipo,
    id_numero: d.idNumero,
    alias: d.alias,
  });
}

/** Beneficiario en dólares (Fedwire o SWIFT); el cuerpo sigue `DestinatarioUsd` del servidor. */
export type DestinatarioUsdForm = {
  rail: "fedwire" | "swift";
  titular: string;
  idTipo: string;
  idNumero: string;
  correo: string;
  telefono: string;
  paisConstitucion: string;
  direccion: { calle1: string; ciudad: string; estado: string; cp: string; pais: string };
  banco: {
    nombre: string;
    cuenta: string;
    tipoCuenta: "checking" | "savings" | "";
    aba: string;
    bic: string;
    direccion: { pais: string };
  };
  alias?: string;
};

export const crearDestinatarioUsd = (d: DestinatarioUsdForm) =>
  invocar<{ id: string; verificacion: Verificacion }>("cobre-transferencias", {
    accion: "contraparte",
    tipo: "business",
    destinatario: d,
  });

export const consultarVerificacion = (contraparteId: string) =>
  invocar<{ id: string; verificacion: Verificacion }>("cobre-transferencias", {
    accion: "verificacion",
    contraparte_id: contraparteId,
  });

// ── Envíos ───────────────────────────────────────────────────────────────────

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

export type ItemLote = { contraparteId: string; monto: number; concepto: string };
export type LoteSpei = {
  id: string;
  estado: string;
  cantidad: number;
  total: number;
  motivo: string | null;
  requiereAprobacion: boolean;
  creadoAt: string;
};

export const enviarLoteSpei = (l: {
  subcuentaId: string;
  idLote: string;
  items: ItemLote[];
  codigo?: string;
}) =>
  invocar<LoteSpei>("cobre-transferencias", {
    accion: "lote",
    subcuenta_id: l.subcuentaId,
    id_lote: l.idLote,
    items: l.items.map((i) => ({
      contraparte_id: i.contraparteId,
      monto: i.monto,
      concepto: i.concepto,
    })),
    codigo: l.codigo,
  });

export async function listLotesSpei(limite = 20): Promise<LoteSpei[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("cobre_lotes")
    .select("id, estado, cantidad, total, motivo, requiere_aprobacion, created_at")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new DataAccessError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    estado: r.estado,
    cantidad: r.cantidad,
    total: Number(r.total),
    motivo: r.motivo,
    requiereAprobacion: r.requiere_aprobacion,
    creadoAt: r.created_at,
  }));
}

export async function listTransferenciasSpei(limite = 50): Promise<TransferenciaSpei[]> {
  const sb = requireSupabase();
  const { data: rows, error } = await sb
    .from("cobre_transferencias")
    .select(
      "id, id_txn, tipo, moneda, monto, concepto, estado, motivo, clave_rastreo, cep, swift_uetr, requiere_aprobacion, lote_id, created_at, cobre_contrapartes(titular, numero)",
    )
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new DataAccessError(error);
  return (rows ?? []).map((r) => {
    const cp = r.cobre_contrapartes as unknown as { titular: string; numero: string } | null;
    return {
      id: r.id,
      idTxn: r.id_txn,
      tipo: r.tipo as TransferenciaSpei["tipo"],
      moneda: r.moneda === "USD" ? "USD" : "MXN",
      monto: Number(r.monto),
      concepto: r.concepto,
      estado: r.estado as EstadoSpei,
      motivo: r.motivo,
      claveRastreo: r.clave_rastreo,
      cep: r.cep,
      swiftUetr: r.swift_uetr,
      requiereAprobacion: r.requiere_aprobacion,
      loteId: r.lote_id,
      destinatario: cp ? `${cp.titular} · ${cp.numero.slice(-4)}` : null,
      creadaAt: r.created_at,
    };
  });
}

export async function listDepositosSpei(limite = 50): Promise<DepositoSpei[]> {
  const sb = requireSupabase();
  const { data: rows, error } = await sb
    .from("cobre_depositos")
    .select("id, monto, remitente, clabe, clave_rastreo, estado, origen, recibido_at")
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
    origen: r.origen === "r2p" ? "r2p" : "spei",
    recibidoAt: r.recibido_at,
  }));
}

// ── Cobros por SPEI (R2P) ────────────────────────────────────────────────────

export type CobroR2p = {
  id: string;
  monto: number;
  concepto: string | null;
  pagador: string;
  clabe: string | null;
  validoHasta: string;
  estado: "creando" | "pendiente" | "pagado" | "vencido" | "rechazado" | "fallido" | "error_envio";
  motivo: string | null;
  linkId: string | null;
  pagadoAt: string | null;
  creadoAt: string;
};

export async function listCobrosR2p(limite = 50): Promise<CobroR2p[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("cobre_cobros_r2p")
    .select(
      "id, monto, concepto, pagador_nombre, clabe_dinamica, valido_hasta, estado, motivo, link_id, pagado_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new DataAccessError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    monto: Number(r.monto),
    concepto: r.concepto,
    pagador: r.pagador_nombre,
    clabe: r.clabe_dinamica,
    validoHasta: r.valido_hasta,
    estado: r.estado as CobroR2p["estado"],
    motivo: r.motivo,
    linkId: r.link_id,
    pagadoAt: r.pagado_at,
    creadoAt: r.created_at,
  }));
}

export const crearCobroR2p = (c: {
  monto: number;
  concepto: string;
  minutos: number;
  subcuentaId?: string;
  pagador: { nombre: string; id_numero: string; correo?: string };
}) =>
  invocar<{ id: string; clabe_dinamica: string | null; valido_hasta: string; aviso?: string }>(
    "cobre-r2p",
    {
      accion: "crear",
      monto: c.monto,
      concepto: c.concepto,
      minutos: c.minutos,
      subcuenta_id: c.subcuentaId,
      pagador: c.pagador,
    },
  );

// ── Dólares ──────────────────────────────────────────────────────────────────

export type Conversion = {
  id: string;
  tasa: number;
  montoMxn: number;
  montoUsd: number;
  comisiones: Record<string, unknown>;
  fueraDeMercado: boolean;
  venceAt: string;
  estado: string;
  motivo: string | null;
  creadaAt: string;
};

const aConversion = (r: Record<string, unknown>): Conversion => ({
  id: String(r.id),
  tasa: Number(r.tasa),
  montoMxn: Number(r.monto_mxn),
  montoUsd: Number(r.monto_usd),
  comisiones: (r.comisiones as Record<string, unknown>) ?? {},
  fueraDeMercado: r.fuera_de_mercado === true,
  venceAt: String(r.cotizacion_vence_at),
  estado: String(r.estado),
  motivo: (r.motivo as string | null) ?? null,
  creadaAt: String(r.created_at),
});

export async function cotizarDolares(
  subcuentaId: string,
  montoMxn: number,
): Promise<Conversion & { enHorario: boolean }> {
  const r = await invocar<Record<string, unknown>>("cobre-fx", {
    accion: "cotizar",
    subcuenta_id: subcuentaId,
    monto_mxn: montoMxn,
  });
  return { ...aConversion(r), enHorario: r.en_horario !== false };
}

export const convertirDolares = async (cruceId: string) =>
  aConversion(
    await invocar<Record<string, unknown>>("cobre-fx", { accion: "convertir", cruce_id: cruceId }),
  );

export async function listConversiones(limite = 30): Promise<Conversion[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("cobre_cruces")
    .select("*")
    .neq("estado", "cotizado")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new DataAccessError(error);
  return (data ?? []).map((r) => aConversion(r as Record<string, unknown>));
}
