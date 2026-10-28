// Edge Function: reembolso de un pago de Ecart Pay (Fase 8).
// Body: { pago_id, monto, motivo: "requested" | "duplicate" | "fraudulent", nota? }.
//
// Lo pide el cliente dueño del pago o un usuario del backoffice con `comercios: modificar`.
// 1) `reservar_reembolso` bloquea el pago y valida el disponible (nunca dos veces lo mismo).
// 2) POST /api/orders/{id}/refund en la cuenta del comercio (monto en unidades).
// 3) `finalizar_reembolso` (aprobado o error) y confirmación de la orden contra Ecart Pay, que
//    deja el pago `reembolsado` o `parcialmente_reembolsado`.

import { EcartPayError } from "../_shared/ecartpay.ts";
import { clienteDeConexion, type ConexionActiva } from "../_shared/conexiones.ts";
import {
  exigirPermiso,
  handler,
  HttpError,
  json,
  readJson,
  serviceClient,
  userClient,
} from "../_shared/http.ts";
import { confirmarPago } from "../_shared/pagos.ts";

const MOTIVOS = ["requested", "duplicate", "fraudulent"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(
  handler(async (req) => {
    const body = await readJson<{
      pago_id?: string;
      monto?: number;
      motivo?: string;
      nota?: string;
    }>(req);
    if (typeof body.pago_id !== "string" || !UUID.test(body.pago_id)) {
      throw new HttpError(400, "Pago inválido");
    }
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw new HttpError(400, "Monto inválido");
    const motivo = body.motivo ?? "requested";
    if (!MOTIVOS.includes(motivo)) throw new HttpError(400, "Motivo inválido");

    const sb = serviceClient();
    const { data: pago, error } = await sb
      .from("pagos")
      .select("id, cliente_legajo, conexion_id, proveedor_orden_id, proveedor")
      .eq("id", body.pago_id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!pago || pago.proveedor !== "ecartpay") throw new HttpError(404, "Pago inexistente");

    // Quién pide: el dueño del pago o el backoffice con permiso.
    const uc = userClient(req);
    const { data: auth } = await uc.auth.getUser();
    if (!auth?.user) throw new HttpError(401, "Sesión inválida");
    const { data: legajo } = await uc.rpc("current_cliente_legajo");
    let origen: "comercio" | "admin";
    if (typeof legajo === "string" && legajo && legajo === pago.cliente_legajo) {
      origen = "comercio";
    } else {
      await exigirPermiso(req, "comercios", "modificar");
      origen = "admin";
    }

    if (!pago.proveedor_orden_id || !pago.conexion_id) {
      throw new HttpError(409, "El pago no tiene una orden en Ecart Pay");
    }
    const { data: con } = await sb
      .from("comercio_proveedores")
      .select("id, comercio_id, entorno, public_id")
      .eq("id", pago.conexion_id)
      .maybeSingle();
    if (!con?.public_id) throw new HttpError(409, "La conexión del comercio ya no está activa");
    const cliente = await clienteDeConexion(sb, {
      id: con.id,
      comercioId: con.comercio_id,
      entorno: con.entorno as ConexionActiva["entorno"],
      publicId: con.public_id,
    });

    const monto2 = Math.round(monto * 100) / 100;
    const { data: reembolsoId, error: errReserva } = await sb.rpc("reservar_reembolso", {
      p_pago_id: pago.id,
      p_monto: monto2,
      p_motivo: motivo,
      p_nota: typeof body.nota === "string" ? body.nota.trim().slice(0, 500) || null : null,
      p_origen: origen,
      p_usuario: auth.user.id,
    });
    if (errReserva)
      throw new HttpError(errReserva.code === "P0002" ? 404 : 409, errReserva.message);

    let respuesta: Record<string, unknown>;
    try {
      respuesta = await cliente.post<Record<string, unknown>>(
        `/api/orders/${encodeURIComponent(pago.proveedor_orden_id)}/refund`,
        { amount: monto2, reason: motivo },
      );
    } catch (e) {
      const msg = e instanceof EcartPayError ? `${e.message} (HTTP ${e.status})` : String(e);
      await sb.rpc("finalizar_reembolso", {
        p_reembolso_id: reembolsoId,
        p_ok: false,
        p_error: msg.slice(0, 500),
        p_respuesta: e instanceof EcartPayError ? (e.cuerpo ?? {}) : {},
      });
      throw new HttpError(
        e instanceof EcartPayError && e.status < 500 ? 422 : 502,
        `Ecart Pay rechazó el reembolso: ${msg}`,
      );
    }

    const idExterno =
      typeof respuesta.id === "string"
        ? respuesta.id
        : typeof respuesta._id === "string"
          ? respuesta._id
          : null;
    const { error: errFin } = await sb.rpc("finalizar_reembolso", {
      p_reembolso_id: reembolsoId,
      p_ok: true,
      p_proveedor_reembolso_id: idExterno,
      p_respuesta: respuesta,
    });
    if (errFin) throw new HttpError(500, errFin.message);

    // El estado del pago sale de la orden (refunded / partially_refunded).
    let estado: string | null = null;
    try {
      estado = (await confirmarPago(sb, pago.id)).estado;
    } catch {
      // Queda para la tarea de pendientes o el aviso de Ecart Pay.
    }
    return json({ ok: true, reembolso_id: reembolsoId, estado_pago: estado });
  }),
);
