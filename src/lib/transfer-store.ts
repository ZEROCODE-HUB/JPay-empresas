// ============================================================================
// transfer-store.ts
// Persistence for the /app/transferencias screen. Everything lives in Supabase
// with RLS by `cliente_legajo`:
//   Drafts               -> transferencias_borrador       (1012)
//   Scheduled transfers  -> transferencias_programadas    (1012)
//   Frequent recipients  -> destinatarios_frecuentes      (1012)
//   Templates            -> plantillas_transferencia      (1016)
//   Single transfer      -> movimientos via RPC           (1010/1015)
// ============================================================================
import { requireSupabase, toDataError } from "@/lib/supabase";
import { detectIdentifierKind, type IdentifierKind } from "@/lib/recipient-validation";

/** UI row for a draft. */
export type Draft = {
  id: string;
  destinatario: string;
  alias: string;
  monto: string;
  concepto: string;
  ref: string;
  fecha: string;
  cbu?: string;
  cuit?: string;
  banco?: string;
  subcuentaOrigen?: string;
  montoNum?: number;
};

/** UI row for a scheduled transfer. */
export type Scheduled = {
  id: string;
  destinatario: string;
  alias: string;
  monto: string;
  fecha: string;
  /** Raw `YYYY-MM-DD` date, so it can prefill an <input type="date">. */
  fechaISO?: string;
  hora: string;
  estado: string;
  concepto: string;
  cbu?: string;
  cuit?: string;
  banco?: string;
  subcuentaOrigen?: string;
  montoNum?: number;
};

/** UI row for a frequent recipient. */
export type FrequentRecipient = {
  id: string;
  nombre: string;
  cuit: string;
  cbu: string;
  alias: string;
  banco: string;
};

export type RecipientInput = {
  nombre: string;
  alias?: string;
  cbu: string;
  cuit?: string;
  banco?: string;
};

export const formatAmount = (n: number) =>
  `$ ${(Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("es-AR");
};

/**
 * `destinatarios_frecuentes.identifier_kind` is CHECKed against
 * ('CBU','CVU','ALIAS') but `detectIdentifierKind` may return UNKNOWN.
 * It is normalized so the insert does not fail.
 */
export function kindForDb(identifier: string): IdentifierKind {
  const kind = detectIdentifierKind(identifier);
  if (kind === "UNKNOWN") return /^\d{22}$/.test(identifier) ? "CBU" : "ALIAS";
  return kind;
}

/** Client code (legajo) of the logged-in user. Throws when there is no session/client. */
async function sessionClientCode(): Promise<string> {
  const sb = requireSupabase();
  const { data: authData, error: authError } = await sb.auth.getUser();
  if (authError) throw new Error("Sesion expirada. Volve a iniciar sesion.");
  const email = authData.user?.email;
  if (!email) throw new Error("Sesion expirada. Volve a iniciar sesion.");

  const { data: cli, error } = await sb
    .from("clientes")
    .select("legajo")
    .eq("correo", email)
    .maybeSingle();
  if (error) throw new Error(toDataError(error).message);
  if (!cli?.legajo) throw new Error("No encontramos el cliente asociado a tu usuario.");
  return cli.legajo as string;
}

/**
 * Turns a PostgREST error into something actionable.
 * PGRST204 = unknown column -> usually means a migration was not applied.
 */
function errorMessage(e: unknown): string {
  const raw = toDataError(e).message ?? String(e);
  const faltaMigracion =
    (e as { code?: string } | null)?.code === "PGRST204" ||
    /Could not find the|column .* does not exist|PGRST204/i.test(raw);
  if (faltaMigracion) {
    return "No se pudo guardar: falta actualizar la base de datos. Contacta a soporte.";
  }
  return raw;
}

function fail(e: unknown): never {
  throw new Error(errorMessage(e));
}

// ============================================================================
// Drafts
// ============================================================================

export function mapDraft(r: Record<string, unknown>): Draft {
  const montoNum = Number(r.monto) || 0;
  const identifier = String(r.destinatario_identifier ?? "");
  return {
    id: String(r.id),
    destinatario: String(r.destinatario_nombre ?? "") || identifier,
    alias: String(r.destinatario_alias ?? ""),
    cbu: String(r.destinatario_cbu ?? identifier),
    cuit: r.destinatario_cuit ? String(r.destinatario_cuit) : undefined,
    banco: r.destinatario_banco ? String(r.destinatario_banco) : undefined,
    subcuentaOrigen: r.subcuenta_origen ? String(r.subcuenta_origen) : undefined,
    montoNum,
    monto: formatAmount(montoNum),
    concepto: String(r.concepto ?? ""),
    ref: "",
    fecha: formatDate(String(r.created_at ?? "")),
  };
}

export async function listDrafts(): Promise<Draft[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("transferencias_borrador")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) fail(error);
  return (data ?? []).map((r) => mapDraft(r as Record<string, unknown>));
}

export async function createDraft(input: {
  destinatario: RecipientInput;
  subcuentaOrigen?: string;
  monto: number;
  concepto: string;
}): Promise<Draft> {
  const sb = requireSupabase();
  const cliente_legajo = await sessionClientCode();

  const { data, error } = await sb
    .from("transferencias_borrador")
    .insert({
      cliente_legajo,
      subcuenta_origen: input.subcuentaOrigen || null,
      destinatario_identifier: input.destinatario.cbu,
      destinatario_kind: kindForDb(input.destinatario.cbu),
      destinatario_nombre: input.destinatario.nombre || input.destinatario.cbu,
      destinatario_alias: input.destinatario.alias ?? null,
      destinatario_cbu: input.destinatario.cbu,
      destinatario_cuit: input.destinatario.cuit ?? null,
      destinatario_banco: input.destinatario.banco ?? null,
      monto: input.monto,
      concepto: input.concepto || null,
    })
    .select()
    .single();

  if (error) fail(error);
  return mapDraft(data as Record<string, unknown>);
}

export async function deleteDraft(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("transferencias_borrador").delete().eq("id", id);
  if (error) fail(error);
}

// ============================================================================
// Scheduled transfers
// ============================================================================

export const STATUS_LABELS: Record<string, string> = {
  programada: "Programada",
  ejecutada: "Ejecutada",
  cancelada: "Cancelada",
  error: "Error",
};

export function mapScheduled(r: Record<string, unknown>): Scheduled {
  const montoNum = Number(r.monto) || 0;
  const identifier = String(r.destinatario_identifier ?? "");
  const estadoDb = String(r.estado ?? "programada");
  return {
    id: String(r.id),
    destinatario: String(r.destinatario_nombre ?? "") || identifier,
    alias: String(r.destinatario_alias ?? ""),
    cbu: String(r.destinatario_cbu ?? identifier),
    cuit: r.destinatario_cuit ? String(r.destinatario_cuit) : undefined,
    banco: r.destinatario_banco ? String(r.destinatario_banco) : undefined,
    subcuentaOrigen: r.subcuenta_origen ? String(r.subcuenta_origen) : undefined,
    montoNum,
    monto: formatAmount(montoNum),
    fecha: formatDate(String(r.fecha_envio ?? "")),
    fechaISO: String(r.fecha_envio ?? "").slice(0, 10),
    hora: String(r.hora_envio ?? "").slice(0, 5),
    estado: STATUS_LABELS[estadoDb] ?? estadoDb,
    concepto: String(r.concepto ?? ""),
  };
}

export async function listScheduledTransfers(): Promise<Scheduled[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("transferencias_programadas")
    .select("*")
    .order("fecha_envio", { ascending: true })
    .order("hora_envio", { ascending: true })
    .limit(100);
  if (error) fail(error);
  return (data ?? []).map((r) => mapScheduled(r as Record<string, unknown>));
}

export async function createScheduledTransfer(input: {
  destinatario: RecipientInput;
  subcuentaOrigen?: string;
  monto: number;
  concepto: string;
  fechaEnvio: string;
  horaEnvio: string;
}): Promise<Scheduled> {
  const sb = requireSupabase();
  const cliente_legajo = await sessionClientCode();

  const { data, error } = await sb
    .from("transferencias_programadas")
    .insert({
      cliente_legajo,
      subcuenta_origen: input.subcuentaOrigen || null,
      destinatario_identifier: input.destinatario.cbu,
      destinatario_kind: kindForDb(input.destinatario.cbu),
      destinatario_nombre: input.destinatario.nombre || input.destinatario.cbu,
      destinatario_alias: input.destinatario.alias ?? null,
      destinatario_cbu: input.destinatario.cbu,
      destinatario_cuit: input.destinatario.cuit ?? null,
      destinatario_banco: input.destinatario.banco ?? null,
      monto: input.monto,
      concepto: input.concepto || null,
      fecha_envio: input.fechaEnvio,
      hora_envio: input.horaEnvio,
      estado: "programada",
    })
    .select()
    .single();

  if (error) fail(error);
  return mapScheduled(data as Record<string, unknown>);
}

/**
 * Cancels the row (it is not deleted: it stays `cancelada` for audit). Only when
 * it is still `programada`, so an already-sent transfer cannot be touched.
 */
export async function cancelScheduledTransfer(id: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("transferencias_programadas")
    .update({ estado: "cancelada", actualizado_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "programada")
    .select("id");
  if (error) fail(error);
  if (!data || data.length === 0) {
    throw new Error("Esta transferencia ya se ejecuto o cancelo: no se puede cancelar.");
  }
}

export async function markScheduledExecuted(id: string): Promise<void> {
  const sb = requireSupabase();
  // Filtering by status avoids overwriting a transfer that already ran
  // (for example from another tab).
  const { error } = await sb
    .from("transferencias_programadas")
    .update({ estado: "ejecutada", actualizado_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "programada");
  if (error) fail(error);
}

/**
 * Updates a scheduled transfer that has not run yet (the recipient arrives already
 * validated from the form).
 */
export async function updateScheduledTransfer(
  id: string,
  input: {
    destinatario: RecipientInput;
    subcuentaOrigen?: string;
    monto: number;
    concepto: string;
    fechaEnvio: string;
    horaEnvio: string;
  },
): Promise<Scheduled> {
  const sb = requireSupabase();

  const { data, error } = await sb
    .from("transferencias_programadas")
    .update({
      subcuenta_origen: input.subcuentaOrigen || null,
      destinatario_identifier: input.destinatario.cbu,
      destinatario_kind: kindForDb(input.destinatario.cbu),
      destinatario_nombre: input.destinatario.nombre || input.destinatario.cbu,
      destinatario_alias: input.destinatario.alias ?? null,
      destinatario_cbu: input.destinatario.cbu,
      destinatario_cuit: input.destinatario.cuit ?? null,
      destinatario_banco: input.destinatario.banco ?? null,
      monto: input.monto,
      concepto: input.concepto || null,
      fecha_envio: input.fechaEnvio,
      hora_envio: input.horaEnvio,
      actualizado_at: new Date().toISOString(),
    })
    .eq("id", id)
    // Only update while it is still `programada`: from a stale screen it was
    // possible to edit one the worker had already executed.
    .eq("estado", "programada")
    .select()
    .maybeSingle();

  if (error) fail(error);
  if (!data) {
    throw new Error("Esta transferencia ya se ejecuto o cancelo: no se puede editar.");
  }
  return mapScheduled(data as Record<string, unknown>);
}

// ============================================================================
// Frequent recipients
// ============================================================================

export function mapFrequentRecipient(r: Record<string, unknown>): FrequentRecipient {
  const identifier = String(r.identifier ?? "");
  return {
    id: String(r.id),
    nombre: String(r.nombre ?? "") || identifier,
    cuit: String(r.cuit ?? ""),
    cbu: String(r.cbu ?? identifier),
    alias: String(r.alias ?? ""),
    banco: String(r.banco ?? ""),
  };
}

export async function listFrequentRecipients(): Promise<FrequentRecipient[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("destinatarios_frecuentes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail(error);
  return (data ?? []).map((r) => mapFrequentRecipient(r as Record<string, unknown>));
}

export async function createFrequentRecipient(input: {
  identifier: string;
  nombre: string;
  alias?: string;
  cbu?: string;
  cuit?: string;
  banco?: string;
}): Promise<FrequentRecipient> {
  const sb = requireSupabase();
  const cliente_legajo = await sessionClientCode();

  const { data, error } = await sb
    .from("destinatarios_frecuentes")
    .insert({
      cliente_legajo,
      identifier: input.identifier,
      identifier_kind: kindForDb(input.identifier),
      nombre: input.nombre || input.identifier,
      alias: input.alias ?? null,
      cbu: input.cbu ?? null,
      cuit: input.cuit ?? null,
      banco: input.banco ?? null,
    })
    .select()
    .single();

  if (error) fail(error);
  return mapFrequentRecipient(data as Record<string, unknown>);
}

export async function deleteFrequentRecipient(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("destinatarios_frecuentes").delete().eq("id", id);
  if (error) fail(error);
}

// ============================================================================
// Transfer templates (migration 1016)
// Name + optional amount, fees origin account and concept. Applying one prefills
// the transfer form; the recipient is chosen at that moment.
// ============================================================================

export type TemplateType = "unica" | "programar";

export type Template = {
  id: string;
  nombre: string;
  tipo: TemplateType;
  subcuentaOrigen?: string;
  /**
   * Already validated recipient. Empty for GENERIC templates (e.g. "Sueldos"):
   * the CBU/CVU/alias is chosen when the template is applied.
   */
  destinatario?: RecipientInput;
  monto?: number;
  concepto?: string;
};

export function mapTemplate(r: Record<string, unknown>): Template {
  const identifier = String(r.destinatario_identifier ?? "");
  const cbu = String(r.destinatario_cbu ?? identifier);
  const tieneDestinatario = Boolean(identifier || cbu);
  return {
    id: String(r.id),
    nombre: String(r.nombre ?? ""),
    tipo: r.tipo === "programar" ? "programar" : "unica",
    subcuentaOrigen: r.subcuenta_origen ? String(r.subcuenta_origen) : undefined,
    destinatario: tieneDestinatario
      ? {
          nombre: String(r.destinatario_nombre ?? "") || identifier,
          alias: r.destinatario_alias ? String(r.destinatario_alias) : undefined,
          cbu,
          cuit: r.destinatario_cuit ? String(r.destinatario_cuit) : undefined,
          banco: r.destinatario_banco ? String(r.destinatario_banco) : undefined,
        }
      : undefined,
    monto: r.monto === null || r.monto === undefined ? undefined : Number(r.monto),
    concepto: r.concepto ? String(r.concepto) : undefined,
  };
}

export async function listTemplates(): Promise<Template[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("plantillas_transferencia")
    .select("*")
    .order("nombre", { ascending: true })
    .limit(100);
  if (error) fail(error);
  return (data ?? []).map(mapTemplate);
}

export async function createTemplate(input: {
  nombre: string;
  tipo: TemplateType;
  /** CBU/CVU/alias (with its kind). Empty = generic template. */
  identifier?: string;
  destinatario?: RecipientInput;
  subcuentaOrigen?: string;
  monto?: number;
  concepto?: string;
}): Promise<Template> {
  const sb = requireSupabase();
  const cliente_legajo = await sessionClientCode();
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("La plantilla necesita un nombre");

  // Generic template (no recipient): "Sueldos", "Rent", etc. The recipient is
  // chosen when it is applied. When one is provided, it is stored validated.
  const identifier = input.identifier?.trim() || "";
  const dest = identifier ? input.destinatario : undefined;

  const { data, error } = await sb
    .from("plantillas_transferencia")
    .insert({
      cliente_legajo,
      nombre,
      tipo: input.tipo,
      subcuenta_origen: input.subcuentaOrigen || null,
      // "" instead of NULL for generic templates: the column ended up NOT NULL in
      // this project (the script ran before it was fixed). NULL also works; the UI
      // treats "" the same as NULL (no recipient).
      destinatario_identifier: identifier || "",
      destinatario_kind: identifier ? kindForDb(identifier) : "ALIAS",
      destinatario_nombre: dest ? (dest.nombre || identifier) || null : null,
      destinatario_alias: dest?.alias ?? null,
      destinatario_cbu: dest?.cbu ?? null,
      destinatario_cuit: dest?.cuit ?? null,
      destinatario_banco: dest?.banco ?? null,
      monto: input.monto != null && input.monto > 0 ? input.monto : null,
      concepto: input.concepto?.trim() || null,
    })
    .select()
    .single();

  if (error) fail(error);
  return mapTemplate(data as Record<string, unknown>);
}

export async function deleteTemplate(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("plantillas_transferencia").delete().eq("id", id);
  if (error) fail(error);
}

/** Edita nombre, monto, origen de fondos y concepto de una plantilla. */
export async function updateTemplate(
  id: string,
  input: { nombre: string; monto?: number; subcuentaOrigen?: string; concepto?: string },
): Promise<Template> {
  const sb = requireSupabase();
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("La plantilla necesita un nombre");

  const { data, error } = await sb
    .from("plantillas_transferencia")
    .update({
      nombre,
      monto: input.monto != null && input.monto > 0 ? input.monto : null,
      subcuenta_origen: input.subcuentaOrigen || null,
      concepto: input.concepto?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) fail(error);
  return mapTemplate(data as Record<string, unknown>);
}

// ============================================================================
// Transferencia unica por BDC (ledger): reservar -> enviar -> confirmar/cancelar
// ============================================================================

export type BdcReserva = {
  ok: boolean;
  id_txn: string;
  ya_registrada: boolean;
  ledger_status: "reserved" | "posted" | "reversed" | "unposted";
  monto: number;
  /** Comisión + IVA (los calcula la base según el CVU de origen). */
  comision: number;
  impuesto: number;
  total: number;
};

/**
 * Paso 1, ANTES de pedirle la transferencia al banco: reserva monto + comisión
 * + IVA (disponible -> retenido). Falla con "Saldo insuficiente" si no alcanza,
 * así nunca se envía plata que la subcuenta no tiene. Idempotente por TXID.
 */
export async function reserveBdcTransfer(input: {
  subcuentaOrigen: string;
  originId: string;
  destinatarioCbu: string;
  destinatarioNombre?: string | null;
  destinatarioCuit?: string | null;
  destinatarioBanco?: string | null;
  monto: number;
  concepto?: string | null;
}): Promise<BdcReserva> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("reservar_transferencia_bdc", {
    p_subcuenta_origen: input.subcuentaOrigen,
    p_origin_id: input.originId,
    p_destinatario_cbu: input.destinatarioCbu,
    p_monto: input.monto,
    p_concepto: input.concepto ?? null,
    p_destinatario_nombre: input.destinatarioNombre ?? null,
    p_destinatario_cuit: input.destinatarioCuit ?? null,
    p_destinatario_banco: input.destinatarioBanco ?? null,
  });
  if (error) fail(error);
  const r = data as BdcReserva & { motivo?: string };
  // Rechazo de negocio (bloqueo, saldo o controles): la base la registra como
  // RECHAZADA y devuelve el motivo; nunca se envía al banco.
  if (r.ok === false) throw new Error(r.motivo || "La transferencia fue rechazada");
  return r;
}

/** Paso 2: el banco aceptó la transferencia -> se contabiliza (idempotente). */
export async function confirmBdcTransfer(originId: string, estadoBdc?: string | null): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("confirmar_transferencia_bdc", {
    p_origin_id: originId,
    p_estado_bdc: estadoBdc ?? null,
  });
  if (error) fail(error);
}

/** El banco nunca recibió la transferencia -> se libera la reserva. */
export async function cancelBdcTransfer(originId: string, motivo?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("cancelar_transferencia_bdc", {
    p_origin_id: originId,
    p_motivo: motivo ?? null,
  });
  if (error) fail(error);
}
// ============================================================================
// Cotizacion (solo lectura): comision + IVA + total y si alcanza el disponible.
// La calcula la base con la misma regla que cobra al enviar.
// ============================================================================

/** Comisión configurada en backoffice ("Carga de comisiones") que se aplica. */
export type ComisionConfig = {
  modalidad: "Porcentaje" | "Fijo";
  porcentaje: number | null;
  montoFijo: number | null;
  /** % de IVA sobre la comisión, el cargado para esa comisión. */
  porcentajeImpuesto: number;
  /** Si es la del CVU de origen o la de toda la cuenta (respaldo). */
  alcance: "cvu" | "cuenta";
};

export type Cotizacion = {
  monto: number;
  comision: number;
  impuesto: number;
  total: number;
  disponible: number;
  alcanza: boolean;
  faltante: number;
  /** Transferencia a otro CVU propio: no cobra comisión ni IVA. */
  interna: boolean;
  /** null = el cliente no tiene comisión de Retiro configurada. */
  config: ComisionConfig | null;
};

export async function cotizarTransferencia(input: {
  subcuentaOrigen: string;
  monto: number;
  destino?: string | null;
}): Promise<Cotizacion> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("cotizar_transferencia", {
    p_subcuenta_origen: input.subcuentaOrigen,
    p_monto: input.monto,
    p_destino: input.destino ?? null,
  });
  if (error) fail(error);
  const r = data as Record<string, unknown>;
  const c = r.config as Record<string, unknown> | null | undefined;
  return {
    monto: Number(r.monto),
    comision: Number(r.comision),
    impuesto: Number(r.impuesto),
    total: Number(r.total),
    disponible: Number(r.disponible),
    alcanza: Boolean(r.alcanza),
    faltante: Number(r.faltante),
    interna: Boolean(r.interna),
    config: c
      ? {
          modalidad: c.modalidad === "Fijo" ? "Fijo" : "Porcentaje",
          porcentaje: c.porcentaje == null ? null : Number(c.porcentaje),
          montoFijo: c.monto_fijo == null ? null : Number(c.monto_fijo),
          porcentajeImpuesto: Number(c.porcentaje_impuesto ?? 21),
          alcance: c.alcance === "cvu" ? "cvu" : "cuenta",
        }
      : null,
  };
}
