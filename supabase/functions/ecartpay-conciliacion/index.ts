// Edge Function PÚBLICA (desplegar con --no-verify-jwt), Fase 8: conciliación con Ecart Pay.
//
// - Sin body: la dispara pg_cron una vez al día. No recibe datos y corre como máximo una vez cada
//   20 horas (`reservar_tarea`), así que no hace falta un secreto.
// - { manual: true }: la lanza un admin desde el panel (sin límite de frecuencia).
//
// Por cada comercio conectado trae GET /api/transactions de los últimos 3 días y lo compara con
// `pagos` (`conciliar`). Guarda comisión y neto en cada pago, registra las diferencias en
// `conciliacion_proveedor_diferencias` y, si un estado no coincide, vuelve a consultar la orden.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { clienteDeConexion, type ConexionActiva } from "../_shared/conexiones.ts";
import {
  conciliar,
  EcartPayCliente,
  transaccionesDePago,
  type PagoAConciliar,
} from "../_shared/ecartpay.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";
import { confirmarPago } from "../_shared/pagos.ts";

const DIAS = 3;
const MAX_PAGINAS = 30;

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
      const { data: libre, error } = await sb.rpc("reservar_tarea", {
        p_nombre: "ecartpay-conciliacion",
        p_intervalo: "20 hours",
      });
      if (error) throw new HttpError(500, error.message);
      if (!libre) return json({ ok: true, omitida: "ya corrió en las últimas 20 horas" });
    }

    const hasta = new Date();
    const desde = new Date(hasta.getTime() - DIAS * 86_400_000);
    const { data: corrida, error: e0 } = await sb
      .from("conciliaciones_proveedor")
      .insert({
        proveedor: "ecartpay",
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
        origen: manual ? "manual" : "programada",
      })
      .select("id")
      .single();
    if (e0) throw new HttpError(500, e0.message);

    const { data: conexiones } = await sb
      .from("comercio_proveedores")
      .select("id, comercio_id, entorno, public_id")
      .eq("proveedor", "ecartpay")
      .eq("estado", "conectado")
      .not("public_id", "is", null);

    const resumen = {
      comercios: 0,
      transacciones: 0,
      pagos: 0,
      diferencias: 0,
      errores: [] as string[],
    };
    for (const c of conexiones ?? []) {
      const conexion: ConexionActiva = {
        id: c.id,
        comercioId: c.comercio_id,
        entorno: c.entorno as ConexionActiva["entorno"],
        publicId: c.public_id as string,
      };
      try {
        const r = await conciliarConexion(sb, corrida.id, conexion, desde, hasta);
        resumen.comercios++;
        resumen.transacciones += r.transacciones;
        resumen.pagos += r.pagos;
        resumen.diferencias += r.diferencias;
      } catch (e) {
        resumen.errores.push(`${c.comercio_id}: ${(e as Error).message}`.slice(0, 300));
      }
    }
    await sb
      .from("conciliaciones_proveedor")
      .update({ resumen, error: resumen.errores.length ? resumen.errores.join(" | ") : null })
      .eq("id", corrida.id);
    return json({ ok: true, conciliacion_id: corrida.id, ...resumen });
  }),
);

async function traerTransacciones(cliente: EcartPayCliente, desde: Date): Promise<unknown[]> {
  const docs: unknown[] = [];
  let next: string | undefined;
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const r = await cliente.get<{ docs?: unknown[]; next_token?: string | null }>(
      "/api/transactions",
      { limit: 100, "created_at[from]": desde.toISOString().slice(0, 10), next },
    );
    const pagina = Array.isArray(r?.docs) ? r.docs : [];
    docs.push(...pagina);
    if (!r?.next_token || pagina.length === 0 || r.next_token === next) break;
    next = r.next_token;
  }
  return docs;
}

async function conciliarConexion(
  sb: SupabaseClient,
  conciliacionId: string,
  conexion: ConexionActiva,
  desde: Date,
  hasta: Date,
) {
  const cliente = await clienteDeConexion(sb, conexion);
  const txs = transaccionesDePago(await traerTransacciones(cliente, desde));

  const { data: filas, error } = await sb
    .from("pagos")
    .select("id, proveedor_orden_id, estado, monto")
    .eq("conexion_id", conexion.id)
    .gte("created_at", desde.toISOString())
    .lte("created_at", hasta.toISOString());
  if (error) throw new Error(error.message);
  // Pagos más viejos que el período pero con transacción en él (p. ej. SPEI pagado días después).
  const ordenesFuera = txs
    .map((t) => t.ordenId)
    .filter((o) => !(filas ?? []).some((f) => f.proveedor_orden_id === o));
  const { data: extra } = ordenesFuera.length
    ? await sb
        .from("pagos")
        .select("id, proveedor_orden_id, estado, monto")
        .eq("conexion_id", conexion.id)
        .in("proveedor_orden_id", ordenesFuera)
    : { data: [] };
  const pagos: PagoAConciliar[] = [...(filas ?? []), ...(extra ?? [])].map((p) => ({
    id: p.id,
    ordenId: p.proveedor_orden_id,
    estado: p.estado,
    monto: Number(p.monto),
  }));

  const { diferencias, coincidencias } = conciliar(txs, pagos);

  for (const { pagoId, tx } of coincidencias) {
    await sb
      .from("pagos")
      .update({
        comision_proveedor: tx.comision,
        neto_proveedor: tx.neto,
        proveedor_transaccion_id: tx.id,
        conciliado_at: new Date().toISOString(),
      })
      .eq("id", pagoId);
  }
  for (const d of diferencias) {
    // Un estado distinto se intenta corregir consultando la orden; si se corrige, no se anota.
    // Solo se corrige el caso "Ecart Pay cobró y JPay no lo sabía"; si JPay ya lo tenía pagado y
    // Ecart Pay dice que no, `aplicar_estado_pago` no lo baja: esa diferencia hay que anotarla.
    if (d.tipo === "estado_distinto" && d.pagoId) {
      const antes = pagos.find((x) => x.id === d.pagoId)?.estado ?? "";
      const cobrado = (e: string) => e === "pagado" || e.includes("reembolsado");
      try {
        const p = await confirmarPago(sb, d.pagoId);
        if (!cobrado(antes) && cobrado(p.estado)) continue;
      } catch {
        // se anota la diferencia
      }
    }
    await sb.from("conciliacion_proveedor_diferencias").upsert(
      {
        conciliacion_id: conciliacionId,
        conexion_id: conexion.id,
        tipo: d.tipo,
        pago_id: d.pagoId,
        orden_id: d.ordenId,
        transaccion_id: d.transaccionId,
        detalle: d.detalle,
      },
      { ignoreDuplicates: true },
    );
  }
  return { transacciones: txs.length, pagos: pagos.length, diferencias: diferencias.length };
}
