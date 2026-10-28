// Confirmación de pagos contra el proveedor: el estado de un pago SIEMPRE sale de consultar la
// orden (GET /api/orders/{id}), nunca de una redirección ni del contenido de un aviso.
// La usan el checkout (`ecartpay-checkout`), los avisos (`ecartpay-webhook`) y la tarea de
// pendientes (`ecartpay-pendientes`). Solo en el repo del portal empresas.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { clienteDeConexion, type ConexionActiva } from "./conexiones.ts";
import { resumirOrden } from "./ecartpay.ts";
import { HttpError } from "./http.ts";

export type PagoConfirmado = {
  id: string;
  estado: string;
  monto: number;
  moneda: string;
  motivo: string | null;
  metodo: string | null;
  pagado_at: string | null;
  orden_id: string | null;
};

const COLUMNAS =
  "id, conexion_id, proveedor_orden_id, estado, monto, moneda, motivo, metodo, pagado_at";

type FilaPago = {
  id: string;
  conexion_id: string | null;
  proveedor_orden_id: string | null;
  estado: string;
  monto: number;
  moneda: string;
  motivo: string | null;
  metodo: string | null;
  pagado_at: string | null;
};

const salida = (p: FilaPago): PagoConfirmado => ({
  id: p.id,
  estado: p.estado,
  monto: Number(p.monto),
  moneda: p.moneda,
  motivo: p.motivo,
  metodo: p.metodo,
  pagado_at: p.pagado_at,
  orden_id: p.proveedor_orden_id,
});

/** Consulta la orden del pago en Ecart Pay y aplica el estado (idempotente). */
export async function confirmarPago(sb: SupabaseClient, pagoId: string): Promise<PagoConfirmado> {
  const { data: pago, error } = await sb
    .from("pagos")
    .select(COLUMNAS)
    .eq("id", pagoId)
    .eq("proveedor", "ecartpay")
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!pago) throw new HttpError(404, "Pago inexistente");
  const p = pago as FilaPago;
  if (!p.proveedor_orden_id || !p.conexion_id) return salida(p);

  const { data: con } = await sb
    .from("comercio_proveedores")
    .select("id, comercio_id, entorno, public_id")
    .eq("id", p.conexion_id)
    .maybeSingle();
  if (!con?.public_id) throw new HttpError(409, "La conexión del comercio ya no está activa");
  const conexion: ConexionActiva = {
    id: con.id,
    comercioId: con.comercio_id,
    entorno: con.entorno as ConexionActiva["entorno"],
    publicId: con.public_id,
  };
  const cliente = await clienteDeConexion(sb, conexion);
  const orden = await cliente.get<Record<string, unknown>>(
    `/api/orders/${encodeURIComponent(p.proveedor_orden_id)}`,
  );
  const r = resumirOrden(orden);
  const { data: final, error: e2 } = await sb.rpc("aplicar_estado_pago", {
    p_pago_id: p.id,
    p_estado: r.estado,
    p_estado_proveedor: r.estadoProveedor,
    p_motivo: r.motivo,
    p_metodo: r.metodo,
    p_proveedor_pago_id: r.pagoId,
    p_respuesta: orden,
  });
  if (e2) throw new HttpError(500, e2.message);
  return salida(final as FilaPago);
}

/** Id del pago de JPay para una orden del proveedor, o null si la orden no es nuestra. */
export async function pagoPorOrden(sb: SupabaseClient, ordenId: string): Promise<string | null> {
  const { data, error } = await sb
    .from("pagos")
    .select("id")
    .eq("proveedor", "ecartpay")
    .eq("proveedor_orden_id", ordenId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data?.id ?? null;
}

/**
 * Procesa un aviso registrado en `webhook_eventos`: busca el pago de la orden y lo confirma
 * contra Ecart Pay. Deja el resultado en el evento. Lo usan el webhook y "Reprocesar".
 */
export async function procesarEvento(
  sb: SupabaseClient,
  eventoId: string,
  idExterno: string | null,
) {
  let resultado = "ignorado";
  let error: string | null = null;
  let pagoId: string | null = null;
  try {
    pagoId = idExterno ? await pagoPorOrden(sb, idExterno) : null;
    if (pagoId) {
      const p = await confirmarPago(sb, pagoId);
      resultado = `pago ${p.estado}`;
    }
  } catch (e) {
    resultado = "error";
    error = (e as Error).message.slice(0, 500);
  }
  const { data: prev } = await sb
    .from("webhook_eventos")
    .select("intentos")
    .eq("id", eventoId)
    .single();
  await sb
    .from("webhook_eventos")
    .update({
      pago_id: pagoId,
      resultado,
      error,
      intentos: (prev?.intentos ?? 0) + 1,
      procesado_at: new Date().toISOString(),
    })
    .eq("id", eventoId);
}
