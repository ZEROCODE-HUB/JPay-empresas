// Edge Function del checkout público (/p/$code) con Ecart Pay (Fase 4). La llama el navegador
// del pagador con la anon key; todo lo sensible (claves del comercio, montos) se resuelve acá.
//
// Acciones (body.accion):
// - "info":      { code } → { disponible, comercio } si el comercio del link tiene Ecart Pay.
// - "crear":     { code, idempotency_key, monto?, pagador: { nombre, email }, volver_a }
//                → crea (o reutiliza) el pago y la orden en la cuenta del comercio y devuelve
//                el `pay_link` de Ecart Pay. Nunca crea dos órdenes para el mismo intento.
// - "confirmar": { pago_id } → consulta la orden en Ecart Pay y actualiza el estado. Nunca se
//                confía en la redirección: el estado sale siempre de GET /api/orders/{id}.

import { clienteDeConexion, conexionEcartPay, urlDeVuelta } from "../_shared/conexiones.ts";
import {
  EcartPayError,
  leerReferenciaPago,
  METODOS_EXTERNOS,
  type MetodoExterno,
} from "../_shared/ecartpay.ts";
import { handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";
import { confirmarPago } from "../_shared/pagos.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Link = {
  id: string;
  estado: string;
  monto: number;
  pagos_parciales: boolean;
  expira_en: string | null;
  cliente_legajo: string;
  referencia: string | null;
};

type Body = {
  accion?: string;
  code?: string;
  idempotency_key?: string;
  /** "tarjeta" (por defecto: se paga en la página de Ecart Pay), "spei" u "oxxo". */
  metodo?: string;
  monto?: number;
  pagador?: { nombre?: string; email?: string };
  volver_a?: string;
  pago_id?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    switch (body.accion) {
      case "info": {
        const { link, conexion, comercio } = await contexto(sb, body.code);
        return json({ disponible: !!conexion && vigente(link), comercio });
      }
      case "crear":
        return json(await crear(sb, body));
      case "confirmar":
        return json(await confirmar(sb, body.pago_id));
      default:
        throw new HttpError(400, "Acción inválida");
    }
  }),
);

/** Link por código, conexión con Ecart Pay de su comercio y nombre del comercio. */
async function contexto(sb: SupabaseClient, code: unknown) {
  if (typeof code !== "string" || !code.trim()) throw new HttpError(400, "Falta el código");
  const { data, error } = await sb.rpc("obtener_link_pago", { p_codigo: code.trim() });
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Link de pago inexistente");
  const link = data as Link;

  const { data: fila } = await sb
    .from("cliente_links_pago")
    .select("comercio_id, comercio_nombre")
    .eq("id", link.id)
    .maybeSingle();
  let comercioIds: string[];
  if (fila?.comercio_id) {
    comercioIds = [fila.comercio_id];
  } else {
    const { data: comercios } = await sb
      .from("comercios")
      .select("id")
      .eq("legajo", link.cliente_legajo);
    comercioIds = (comercios ?? []).map((c) => c.id);
  }
  const conexion = await conexionEcartPay(sb, comercioIds);
  return { link, conexion, comercio: fila?.comercio_nombre ?? null };
}

function vigente(link: Link): boolean {
  if (link.estado === "Inactivo") return false;
  return !link.expira_en || new Date(link.expira_en).getTime() > Date.now();
}

async function crear(sb: SupabaseClient, body: Body) {
  const clave = body.idempotency_key;
  if (typeof clave !== "string" || clave.length < 16 || clave.length > 100) {
    throw new HttpError(400, "Falta la clave del intento de pago");
  }
  // Mismo intento: devolver lo ya creado (doble clic, reintento de red).
  const { data: previo } = await sb
    .from("pagos")
    .select("id, pay_link, estado")
    .eq("idempotency_key", clave)
    .maybeSingle();
  if (previo?.pay_link) return { pago_id: previo.id, pay_link: previo.pay_link };
  if (previo) {
    // Intento sin orden: falló (el navegador genera otra clave) o está en curso en otro request.
    throw new HttpError(409, "Este intento de pago no se pudo iniciar. Probá de nuevo.");
  }

  const { link, conexion, comercio } = await contexto(sb, body.code);
  if (!vigente(link)) throw new HttpError(409, "El link de pago no está disponible");
  if (!conexion) throw new HttpError(409, "Este comercio no tiene Ecart Pay conectado");

  const metodo: MetodoExterno | null =
    body.metodo === "spei" || body.metodo === "oxxo" ? body.metodo : null;
  const total = Number(link.monto);
  const monto = link.pagos_parciales && body.monto ? Number(body.monto) : total;
  if (!Number.isFinite(monto) || monto <= 0 || monto > total) {
    throw new HttpError(400, "Monto inválido");
  }
  const monto2 = Math.round(monto * 100) / 100;
  const tope = metodo ? METODOS_EXTERNOS[metodo].tope : null;
  if (tope && monto2 > tope) {
    throw new HttpError(400, `El pago en OXXO admite hasta $${tope.toLocaleString("es-MX")} MXN`);
  }
  const nombre = (body.pagador?.nombre ?? "").trim().slice(0, 120);
  const email = (body.pagador?.email ?? "").trim().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Email inválido");

  const { data: pago, error } = await sb
    .from("pagos")
    .insert({
      proveedor: "ecartpay",
      conexion_id: conexion.id,
      comercio_id: conexion.comercioId,
      cliente_legajo: link.cliente_legajo,
      link_id: link.id,
      entorno: conexion.entorno,
      monto: monto2,
      moneda: "MXN",
      pagador_nombre: nombre || null,
      pagador_email: email,
      idempotency_key: clave,
    })
    .select("id, pay_link, estado")
    .single();
  if (error) {
    // Carrera con otro request del mismo intento: usar el suyo.
    if (error.code === "23505") return await crear(sb, body);
    throw new HttpError(500, error.message);
  }

  const volver = new URL(urlDeVuelta(body.volver_a, `/p/${encodeURIComponent(String(body.code))}`));
  volver.searchParams.set("pago", pago.id);
  const [nombrePila, ...apellidos] = nombre.split(/\s+/).filter(Boolean);
  const concepto = (link.referencia || `Pago a ${comercio ?? "comercio"}`).slice(0, 120);

  try {
    const cliente = await clienteDeConexion(sb, conexion);
    const orden = await cliente.post<Record<string, unknown>>("/api/orders", {
      currency: "MXN",
      email,
      first_name: nombrePila ?? undefined,
      last_name: apellidos.join(" ") || undefined,
      items: [{ name: concepto, price: monto2, quantity: 1, is_service: true }],
      // El id del pago va en `reference`. Sin metafields: Ecart Pay rechaza a veces UUIDs ahí
      // ("must not contain payment card or bank account data", falso positivo por los dígitos).
      reference: pago.id,
      redirect_url: volver.toString(),
      notify_url: `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "")}/functions/v1/ecartpay-webhook`,
      send_email: false,
    });
    const ordenId = typeof orden.id === "string" ? orden.id : null;
    const payLink = typeof orden.pay_link === "string" ? orden.pay_link : null;
    if (!ordenId || !payLink) throw new EcartPayError(502, "La orden no trae id o pay_link", orden);
    const { error: e2 } = await sb
      .from("pagos")
      .update({ proveedor_orden_id: ordenId, pay_link: payLink, respuesta: orden })
      .eq("id", pago.id);
    if (e2) throw new HttpError(500, e2.message);
    if (!metodo) return { pago_id: pago.id, pay_link: payLink };

    // SPEI / OXXO: se procesa la orden con ese método y se entrega la referencia para pagar.
    await cliente.post(`/api/orders/${encodeURIComponent(ordenId)}/process`, {
      method_id: METODOS_EXTERNOS[metodo].methodId,
    });
    const publica = await cliente.get<Record<string, unknown>>(
      `/api/orders/public/${encodeURIComponent(ordenId)}`,
    );
    const ref = leerReferenciaPago(publica, metodo);
    if (!ref) throw new EcartPayError(502, "Ecart Pay no devolvió la referencia de pago", publica);
    const { error: e3 } = await sb
      .from("pagos")
      .update({
        metodo,
        referencia: ref.referencia,
        referencia_vence_at: ref.venceAt,
        referencia_url: ref.url,
      })
      .eq("id", pago.id);
    if (e3) throw new HttpError(500, e3.message);
    await sb.rpc("aplicar_estado_pago", {
      p_pago_id: pago.id,
      p_estado: "pendiente",
      p_estado_proveedor: typeof publica.status === "string" ? publica.status : null,
      p_metodo: metodo,
    });
    return { pago_id: pago.id, metodo, referencia: ref.referencia, vence_at: ref.venceAt };
  } catch (e) {
    const motivo = e instanceof EcartPayError ? `${e.message} (HTTP ${e.status})` : String(e);
    await sb.rpc("aplicar_estado_pago", {
      p_pago_id: pago.id,
      p_estado: "error",
      p_motivo: motivo.slice(0, 500),
    });
    if (e instanceof EcartPayError && (e.status === 400 || e.status === 422)) {
      throw new HttpError(422, `Ecart Pay rechazó los datos: ${e.message}`);
    }
    throw new HttpError(502, "No se pudo iniciar el pago con Ecart Pay. Probá de nuevo.");
  }
}

async function confirmar(sb: SupabaseClient, pagoId: unknown) {
  if (typeof pagoId !== "string" || !UUID.test(pagoId)) throw new HttpError(400, "Pago inválido");
  return await confirmarPago(sb, pagoId);
}
