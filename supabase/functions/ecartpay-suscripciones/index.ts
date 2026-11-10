// Edge Function: suscripciones con tarjeta en la cuenta de Ecart Pay del comercio (Fase 5).
// La usa el comercio dueño o un admin (con `comercio_id`). Body: { accion, comercio_id?, ... }.
//
// Acciones:
//   crear       { idempotency_key, nombre, email, telefono?, servicio, beneficios?, monto, moneda?,
//                 intervalo, frecuencia?, dias_prueba?, ciclo_dia?, ciclo_mes?, fecha_fin?,
//                 compromiso_periodos? } → la suscripción con su `checkout_link` para compartir.
//   sincronizar { id }       → estado actual según Ecart Pay.
//   pausar | reanudar | cancelar { id }
// El listado lo lee el portal / admin directo de la tabla `suscripciones` (RLS).

import { EcartPayError } from "../_shared/ecartpay.ts";
import { handler, HttpError, json, readJson, serviceClient, userClient } from "../_shared/http.ts";
import {
  cambiarEstadoSuscripcion,
  contextoDeSolicitud,
  crearSuscripcion,
  entero,
  sincronizarSuscripcion,
  texto,
} from "../_shared/recurrentes.ts";

type Body = Record<string, unknown> & { accion?: string; comercio_id?: unknown; id?: unknown };

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    const ctx = await contextoDeSolicitud(req, sb, body.comercio_id);

    // La suscripción indicada, si es del comercio.
    const propia = async () => {
      if (typeof body.id !== "string") throw new HttpError(400, "Falta id");
      const { data } = await sb
        .from("suscripciones")
        .select("*")
        .eq("id", body.id)
        .eq("comercio_id", ctx.comercioId)
        .maybeSingle();
      if (!data) throw new HttpError(404, "Suscripción inexistente");
      return data;
    };

    try {
      switch (body.accion) {
        case "crear": {
          const clave = texto(body.idempotency_key, 100);
          if (!clave || clave.length < 16) throw new HttpError(400, "Falta la clave del intento");
          const { data: u } = await userClient(req).auth.getUser();
          return json(
            await crearSuscripcion(ctx, {
              idempotencyKey: clave,
              nombre: texto(body.nombre, 120) ?? "",
              email: texto(body.email, 200) ?? "",
              telefono: texto(body.telefono, 30),
              servicio: texto(body.servicio, 120) ?? "",
              beneficios: Array.isArray(body.beneficios)
                ? body.beneficios.map((b) => texto(b, 120)).filter((b): b is string => !!b)
                : [],
              monto: Number(body.monto),
              moneda: body.moneda === "USD" ? "USD" : "MXN",
              intervalo: texto(body.intervalo, 20) ?? "",
              frecuencia: entero(body.frecuencia) ?? 1,
              diasPrueba: entero(body.dias_prueba) ?? 0,
              cicloDia: entero(body.ciclo_dia),
              cicloMes: entero(body.ciclo_mes),
              fechaFin: texto(body.fecha_fin, 10),
              compromisoPeriodos: entero(body.compromiso_periodos),
              creadoPor: u?.user?.id ?? null,
            }),
          );
        }
        case "sincronizar":
          return json(await sincronizarSuscripcion(ctx, await propia()));
        case "pausar":
          return json(await cambiarEstadoSuscripcion(ctx, await propia(), "paused"));
        case "reanudar":
          return json(await cambiarEstadoSuscripcion(ctx, await propia(), "active"));
        case "cancelar":
          return json(await cambiarEstadoSuscripcion(ctx, await propia(), "cancelled"));
        default:
          throw new HttpError(400, "Acción inválida");
      }
    } catch (e) {
      if (e instanceof EcartPayError) {
        throw new HttpError(
          e.status >= 400 && e.status < 500 ? 422 : 502,
          `No se pudo completar la operación: ${e.message}`,
        );
      }
      throw e;
    }
  }),
);
