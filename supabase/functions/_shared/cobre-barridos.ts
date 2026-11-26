// Barrido de comisiones (migración 1073): mueve a JPay la comisión + IVA que se le descontó al
// comercio y que sigue en su Cobre Balance.
//  * Comercio en la cuenta de JPay (sin instancia): movimiento interno de su Balance al Balance de
//    comisiones de JPay (`cobre_configuracion.cuenta_plataforma_id`). Si un rebote dejó el neto
//    negativo, se devuelve al comercio por la misma vía.
//  * Comercio con instancia propia: SPEI desde su Balance a la CLABE de JPay (`barrido_clabe`).
// El monto lo decide siempre `cobre_barrido_reservar` (neto con candado por comercio): este módulo
// solo lo envía y aplica su estado. Lo usan `cobre-transferencias`, `cobre-webhook`,
// `cobre-pendientes` (reintentos y barrido diario) y la acción manual del admin.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  CobreError,
  aCentavos,
  contraparteMx,
  referenciaNumerica,
  resumirTransferencia,
  SIN_DEBITO,
  transferenciaSpei,
} from "./cobre.ts";
import { conexionDeCliente, type ConexionCobre } from "./cobre-servidor.ts";
import { brand } from "./brand.ts";

type Obj = Record<string, unknown>;
const ahora = () => new Date().toISOString();
const ABIERTOS = ["pendiente", "enviado"];

export type FilaBarrido = {
  id: string;
  modo: string;
  cliente_legajo: string;
  instancia_id: string | null;
  via: "interno" | "spei";
  direccion: "a_plataforma" | "a_cliente";
  monto: number;
  cuenta_origen: string;
  destino: string;
  external_id: string;
  mm_id: string | null;
  estado: string;
  created_at?: string;
};

export type ResultadoBarrido = { estado: string; monto?: number; motivo?: string; id?: string };

/** Reserva y envía el barrido de un comercio. No lanza por reglas de negocio: las informa. */
export async function barrerComisiones(
  sb: SupabaseClient,
  legajo: string,
  origen: "envio" | "diario" | "manual",
  opciones: { forzar?: boolean; usuario?: string | null; conexion?: ConexionCobre } = {},
): Promise<ResultadoBarrido> {
  const conexion = opciones.conexion ?? (await conexionDeCliente(sb, legajo));
  const { data, error } = await sb.rpc("cobre_barrido_reservar", {
    p_modo: conexion.modo,
    p_legajo: legajo,
    p_origen: origen,
    p_forzar: opciones.forzar === true,
    p_usuario: opciones.usuario ?? undefined,
  });
  if (error) throw new Error(`No se pudo reservar el barrido: ${error.message}`);
  const r = (data ?? {}) as Obj;
  if (typeof r.omitido === "string") {
    return { estado: "omitido", motivo: r.omitido, monto: Number(r.monto ?? 0) };
  }
  const fila = r as unknown as FilaBarrido;
  if ((fila.instancia_id ?? null) !== (conexion.instanciaId ?? null)) {
    await cerrar(sb, fila.id, "fallido", "La cuenta del comercio cambió de instancia");
    return { estado: "fallido", motivo: "La cuenta del comercio cambió de instancia" };
  }
  return await enviarBarrido(sb, conexion, fila);
}

/** Envía a Cobre una fila `pendiente` (idempotente por external_id). */
export async function enviarBarrido(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  fila: FilaBarrido,
): Promise<ResultadoBarrido> {
  const monto = Number(fila.monto);
  const descripcion = `Comisiones ${brand.name}`;
  let cuerpo: Obj;
  try {
    cuerpo =
      fila.via === "interno"
        ? {
            source_id: fila.cuenta_origen,
            destination_id: fila.destino,
            amount: aCentavos(monto),
            metadata: { description: descripcion },
            external_id: fila.external_id,
            checker_approval: false,
          }
        : transferenciaSpei({
            cuentaOrigen: fila.cuenta_origen,
            contraparte: await contraparteJPay(sb, conexion, fila.destino),
            monto,
            concepto: descripcion,
            referencia: referenciaNumerica(fila.external_id),
            externalId: fila.external_id,
          });
  } catch (e) {
    const motivo = (e as Error).message;
    await cerrar(sb, fila.id, "fallido", motivo);
    return { estado: "fallido", motivo, id: fila.id };
  }

  let mm: Obj;
  try {
    mm = await conexion.cliente.post<Obj>("/money_movements", cuerpo, fila.external_id);
  } catch (e) {
    const motivo = (e as Error).message.slice(0, 300);
    const definitivo =
      e instanceof CobreError &&
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 408 &&
      e.status !== 429;
    if (definitivo) {
      await cerrar(sb, fila.id, "fallido", motivo);
      return { estado: "fallido", motivo, id: fila.id };
    }
    // Sin respuesta: queda pendiente; la revisión de pendientes lo busca por external_id.
    await sb.from("cobre_barridos").update({ motivo, updated_at: ahora() }).eq("id", fila.id);
    return { estado: "pendiente", motivo, id: fila.id };
  }
  const estado = await aplicarEstadoBarrido(sb, fila, mm);
  return { estado, monto, id: fila.id };
}

/** Aplica el estado de un money movement a su barrido. Un estado final no se vuelve a tocar. */
export async function aplicarEstadoBarrido(
  sb: SupabaseClient,
  fila: Pick<FilaBarrido, "id" | "estado" | "mm_id">,
  mm: unknown,
): Promise<string> {
  if (!ABIERTOS.includes(fila.estado)) return fila.estado;
  const r = resumirTransferencia(mm);
  const estado =
    r.estado === "completada"
      ? "completado"
      : SIN_DEBITO.includes(r.estado)
        ? "fallido"
        : "enviado";
  const { error } = await sb
    .from("cobre_barridos")
    .update({
      mm_id: fila.mm_id ?? (r.id || null),
      estado,
      motivo: estado === "fallido" ? (r.motivo ?? r.estadoCobre) : null,
      updated_at: ahora(),
      ...(estado === "completado" ? { completado_at: ahora() } : {}),
    })
    .eq("id", fila.id)
    .in("estado", ABIERTOS);
  if (error) throw new Error(error.message);
  return estado;
}

/** Barrido de un aviso de money movement, si es uno. null = no es un barrido. */
export async function barridoDeAviso(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  mm: Obj,
): Promise<string | null> {
  const ext = String(mm.external_id ?? "").replace(/[^\w-]/g, "");
  const mmId = String(mm.id ?? "").replace(/[^\w-]/g, "");
  if (!ext.startsWith("BAR")) return null;
  let q = sb
    .from("cobre_barridos")
    .select("id, estado, mm_id")
    .eq("modo", conexion.modo)
    .or(`external_id.eq.${ext || "-"},mm_id.eq.${mmId || "-"}`);
  q = conexion.instanciaId
    ? q.eq("instancia_id", conexion.instanciaId)
    : q.is("instancia_id", null);
  const { data } = await q.limit(1).maybeSingle();
  if (!data) return null;
  return await aplicarEstadoBarrido(sb, data, mm);
}

/** Al confirmarse un envío o una conversión: barre si el modo es `por_envio`. Nunca lanza. */
export async function barrerSiCorresponde(
  sb: SupabaseClient,
  legajo: string | null,
): Promise<void> {
  if (!legajo) return;
  try {
    const { data } = await sb
      .from("cobre_configuracion")
      .select("barrido_modo")
      .eq("id", 1)
      .maybeSingle();
    if (data?.barrido_modo !== "por_envio") return;
    await barrerComisiones(sb, legajo, "envio");
  } catch (e) {
    console.error(`barrido ${legajo}: ${(e as Error).message}`);
  }
}

/** Revisión de pendientes: consulta los barridos abiertos y corre el barrido diario si toca. */
export async function revisarBarridos(
  sb: SupabaseClient,
  modo: string,
  conexion: (legajo: string) => Promise<ConexionCobre>,
  errores: string[],
): Promise<{ revisados: number; barridos: number }> {
  const resumen = { revisados: 0, barridos: 0 };
  const hace = (ms: number) => new Date(Date.now() - ms).toISOString();
  const { data: abiertos } = await sb
    .from("cobre_barridos")
    .select("*")
    .eq("modo", modo)
    .in("estado", ABIERTOS)
    .lt("updated_at", hace(2 * 60_000))
    .order("updated_at")
    .limit(50);
  for (const f of (abiertos ?? []) as FilaBarrido[]) {
    resumen.revisados++;
    try {
      const c = await conexion(f.cliente_legajo);
      let mm: unknown = null;
      if (f.mm_id) mm = await c.cliente.get(`/money_movements/${f.mm_id}`);
      else {
        const r = await c.cliente.get<{ contents?: unknown[] }>("/money_movements", {
          external_id: f.external_id,
        });
        mm = r?.contents?.[0] ?? null;
      }
      if (mm) await aplicarEstadoBarrido(sb, f, mm);
      else if (f.estado === "pendiente") {
        // Nunca llegó a Cobre: se reintenta el envío (misma idempotencia) o, pasada 1 h, se cierra.
        if (Date.now() - Date.parse(String(f.created_at)) > 60 * 60_000) {
          await cerrar(sb, f.id, "fallido", "El movimiento no se recibió; no se debitó");
        } else await enviarBarrido(sb, c, f);
      }
    } catch (e) {
      errores.push(`barrido ${f.external_id}: ${(e as Error).message}`.slice(0, 200));
    }
  }

  // Barrido diario (también en `por_envio`, como reintento de lo que quedó).
  const { data: cfg } = await sb
    .from("cobre_configuracion")
    .select("barrido_modo, barrido_hora")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg || cfg.barrido_modo === "desactivado") return resumen;
  const horaMx = (new Date().getUTCHours() + 24 - 6) % 24;
  if (horaMx < Number(cfg.barrido_hora ?? 9)) return resumen;
  const { data: toca } = await sb.rpc("reservar_tarea", {
    p_nombre: "cobre-barrido-diario",
    p_intervalo: "20 hours",
  });
  if (toca !== true) return resumen;
  const { data: cuentas } = await sb
    .from("cobre_cuentas")
    .select("cliente_legajo")
    .eq("modo", modo)
    .eq("tipo", "cliente")
    .eq("estado", "activa");
  for (const { cliente_legajo } of (cuentas ?? []) as { cliente_legajo: string }[]) {
    try {
      const r = await barrerComisiones(sb, cliente_legajo, "diario", {
        conexion: await conexion(cliente_legajo),
      });
      if (r.estado !== "omitido") resumen.barridos++;
      if (r.estado === "fallido") errores.push(`barrido ${cliente_legajo}: ${r.motivo}`);
    } catch (e) {
      errores.push(`barrido ${cliente_legajo}: ${(e as Error).message}`.slice(0, 200));
    }
  }
  return resumen;
}

async function cerrar(sb: SupabaseClient, id: string, estado: string, motivo: string) {
  await sb
    .from("cobre_barridos")
    .update({ estado, motivo: motivo.slice(0, 300), updated_at: ahora() })
    .eq("id", id)
    .in("estado", ABIERTOS);
}

/** Contraparte SPEI de la CLABE de JPay en la instancia del comercio (se crea una sola vez). */
async function contraparteJPay(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  clabe: string,
): Promise<string> {
  if (!conexion.instanciaId)
    throw new CobreError(409, "El SPEI de comisiones es de cuentas propias");
  const { data: previa } = await sb
    .from("cobre_barrido_contrapartes")
    .select("contraparte_externa_id")
    .eq("instancia_id", conexion.instanciaId)
    .eq("clabe", clabe)
    .maybeSingle();
  if (previa) return previa.contraparte_externa_id;
  const { data: cfg } = await sb
    .from("cobre_configuracion")
    .select("barrido_titular, barrido_rfc")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.barrido_titular || !cfg?.barrido_rfc) {
    throw new CobreError(409, "Faltan el titular y el RFC de la CLABE de comisiones");
  }
  const cp = await conexion.cliente.post<{ id: string }>(
    "/counterparties",
    contraparteMx({
      tipo: "clabe",
      numero: clabe,
      titular: cfg.barrido_titular,
      idTipo: "rfc",
      idNumero: cfg.barrido_rfc,
      alias: `${brand.name} comisiones`,
    }),
  );
  await sb.from("cobre_barrido_contrapartes").upsert({
    instancia_id: conexion.instanciaId,
    clabe,
    contraparte_externa_id: cp.id,
  });
  return cp.id;
}
