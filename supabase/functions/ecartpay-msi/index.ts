// Edge Function: meses sin intereses (MSI) y cuotas fijas del comercio en Ecart Pay (Fase 4).
// Solo México (MXN), tarjetas Visa, Mastercard y American Express, en 3, 6, 9, 12 y 18 meses.
// La configuración vive en la cuenta Ecart Pay del comercio (`/api/cards/msi-configuration`).
// La usa un admin (con `comercio_id`) o el comercio dueño. Body: { accion, comercio_id?, ... }.
//
// Acciones: leer | guardar ({ planes: [{ meses, activo, cuotas_fijas, minimo, maximo }],
//                            amex_cuotas_fijas })

import { clienteDeConexion, comercioDeSesion, conexionEcartPay } from "../_shared/conexiones.ts";
import { EcartPayError, msiAEcart, msiDeEcart } from "../_shared/ecartpay.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

type Body = Record<string, unknown> & { accion?: string; comercio_id?: unknown };

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    let comercioId: string;
    if (await esAdmin(req)) {
      if (typeof body.comercio_id !== "string") throw new HttpError(400, "Falta comercio_id");
      comercioId = body.comercio_id;
    } else {
      const pedido = typeof body.comercio_id === "string" ? body.comercio_id : undefined;
      comercioId = (await comercioDeSesion(req, sb, pedido)).id;
    }
    const conexion = await conexionEcartPay(sb, [comercioId]);
    if (!conexion) throw new HttpError(409, "El comercio no tiene Ecart Pay conectado");
    const ecart = await clienteDeConexion(sb, conexion);

    try {
      switch (body.accion) {
        case "leer":
          return json(msiDeEcart(await ecart.get("/api/cards/msi-configuration")));
        case "guardar": {
          let enviar: Record<string, unknown>;
          try {
            enviar = msiAEcart(body);
          } catch (e) {
            throw new HttpError(400, e instanceof Error ? e.message : String(e));
          }
          await ecart.request("POST", "/api/cards/msi-configuration", { body: enviar });
          return json(msiDeEcart(await ecart.get("/api/cards/msi-configuration")));
        }
        default:
          throw new HttpError(400, "Acción inválida");
      }
    } catch (e) {
      if (e instanceof EcartPayError) {
        const status = e.status >= 400 && e.status < 500 ? 422 : 502;
        throw new HttpError(status, `Ecart Pay: ${e.message}`);
      }
      throw e;
    }
  }),
);
