// Edge Function: domiciliación (cargos a la CLABE del cliente) en la cuenta de Ecart Pay del
// comercio (Fase 6). La usa el comercio dueño o un admin (con `comercio_id`).
// Body: { accion, comercio_id?, ... }.
//
// Acciones:
//   crear       { idempotency_key, nombre, email, telefono?, rfc?, clabe, alias?, concepto, monto,
//                 recurrente, intervalo?, ciclo_dia?, fecha_fin? } → la domiciliación (queda
//                 `created` hasta que el cliente acepta y Ecart Pay valida la cuenta).
//   sincronizar { id }
//   cancelar    { id }
// El listado lo lee el portal / admin directo de la tabla `domiciliaciones` (RLS).

import { EcartPayError } from "../_shared/ecartpay.ts";
import { handler, HttpError, json, readJson, serviceClient, userClient } from "../_shared/http.ts";
import {
  cancelarDomiciliacion,
  contextoDeSolicitud,
  crearDomiciliacion,
  entero,
  sincronizarDomiciliacion,
  texto,
} from "../_shared/recurrentes.ts";

type Body = Record<string, unknown> & { accion?: string; comercio_id?: unknown; id?: unknown };

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    const ctx = await contextoDeSolicitud(req, sb, body.comercio_id);

    const propia = async () => {
      if (typeof body.id !== "string") throw new HttpError(400, "Falta id");
      const { data } = await sb
        .from("domiciliaciones")
        .select("*")
        .eq("id", body.id)
        .eq("comercio_id", ctx.comercioId)
        .maybeSingle();
      if (!data) throw new HttpError(404, "Domiciliación inexistente");
      return data;
    };

    try {
      switch (body.accion) {
        case "crear": {
          const clave = texto(body.idempotency_key, 100);
          if (!clave || clave.length < 16) throw new HttpError(400, "Falta la clave del intento");
          const { data: u } = await userClient(req).auth.getUser();
          const recurrente = body.recurrente !== false;
          return json(
            await crearDomiciliacion(ctx, {
              idempotencyKey: clave,
              nombre: texto(body.nombre, 120) ?? "",
              email: texto(body.email, 200) ?? "",
              telefono: texto(body.telefono, 30),
              rfc: texto(body.rfc, 13)?.toUpperCase() ?? null,
              clabe: (texto(body.clabe, 30) ?? "").replace(/\D/g, ""),
              alias: texto(body.alias, 40) ?? "",
              concepto: texto(body.concepto, 120) ?? "",
              monto: Number(body.monto),
              recurrente,
              intervalo: recurrente ? texto(body.intervalo, 20) : null,
              cicloDia: entero(body.ciclo_dia),
              fechaFin: texto(body.fecha_fin, 10),
              creadoPor: u?.user?.id ?? null,
            }),
          );
        }
        case "sincronizar":
          return json(await sincronizarDomiciliacion(ctx, await propia()));
        case "cancelar":
          return json(await cancelarDomiciliacion(ctx, await propia()));
        default:
          throw new HttpError(400, "Acción inválida");
      }
    } catch (e) {
      if (e instanceof EcartPayError) {
        throw new HttpError(
          e.status >= 400 && e.status < 500 ? 422 : 502,
          `Ecart Pay: ${e.message}`,
        );
      }
      throw e;
    }
  }),
);
