// Edge Function: estado de la pasarela propia de Ecart Pay en la cuenta del comercio y su
// activación. Si está apagada, el checkout de Ecart Pay (links de pago, suscripciones) responde
// «The account has not active payment methods».
// Body: { comercio_id?, accion?: "activar" }. Sin `accion` solo consulta.
// Responde { pasarela: PasarelaEcart | null }.

import {
  clienteDeConexion,
  comercioDeLaSolicitud,
  conexionEcartPay,
} from "../_shared/conexiones.ts";
import { EcartPayError, pasarelaPropia } from "../_shared/ecartpay.ts";
import { handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

Deno.serve(
  handler(async (req) => {
    const body = await readJson<{ comercio_id?: unknown; accion?: unknown }>(req);
    const sb = serviceClient();
    const comercioId = await comercioDeLaSolicitud(req, sb, body.comercio_id);
    const conexion = await conexionEcartPay(sb, [comercioId]);
    if (!conexion) return json({ pasarela: null });
    const ecart = await clienteDeConexion(sb, conexion);
    try {
      let pasarela = pasarelaPropia(await ecart.get<unknown>("/api/gateways"));
      if (body.accion === "activar") {
        if (!pasarela)
          throw new HttpError(404, "No se encontró la pasarela de cobros en tu cuenta");
        if (!pasarela.activa) {
          await ecart.request("PUT", `/api/gateways/${encodeURIComponent(pasarela.id)}`, {
            body: { active: true },
          });
          pasarela = pasarelaPropia(await ecart.get<unknown>("/api/gateways"));
        }
      }
      return json({ pasarela });
    } catch (e) {
      if (e instanceof EcartPayError) {
        throw new HttpError(502, `No se pudo consultar el procesador de pagos: ${e.message}`);
      }
      throw e;
    }
  }),
);
