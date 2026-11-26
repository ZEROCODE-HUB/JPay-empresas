// Edge Function: inicia la conexión del comercio con Ecart Pay (OAuth, Fase 3).
// Crea un `state` de un solo uso (oauth_estados, vence en 60 minutos) ligado al usuario y al
// comercio, y devuelve la URL de Ecart Pay a la que hay que mandar al usuario.
// Body: { comercio_id?: string, volver_a?: string }.
// La puede iniciar el cliente dueño del comercio (vuelve al portal) o un administrador desde el
// panel, indicando `comercio_id` y `volver_a` (vuelve al panel; el admin inicia sesión en Ecart
// Pay con la cuenta de ESE comercio).

import {
  type Comercio,
  comercioDeSesion,
  urlDeVuelta,
  urlDeVueltaAdmin,
} from "../_shared/conexiones.ts";
import {
  appOAuth,
  baseUrlEcartPay,
  redirectUriOAuth,
  urlAutorizacionOAuth,
} from "../_shared/ecartpay.ts";
import {
  esAdmin,
  handler,
  HttpError,
  json,
  readJson,
  serviceClient,
  userClient,
} from "../_shared/http.ts";

Deno.serve(
  handler(async (req) => {
    const body = await readJson<{ comercio_id?: string; volver_a?: string }>(req);
    const sb = serviceClient();

    const { data: auth } = await userClient(req).auth.getUser();
    if (!auth?.user) throw new HttpError(401, "Sesión inválida");
    const admin = await esAdmin(req);
    let comercio: Comercio;
    if (admin) {
      if (!body.comercio_id) throw new HttpError(400, "Falta comercio_id");
      const { data, error: e } = await sb
        .from("comercios")
        .select("id, legajo, nombre_comercio")
        .eq("id", body.comercio_id)
        .maybeSingle();
      if (e) throw new HttpError(500, e.message);
      if (!data) throw new HttpError(404, "Comercio inexistente");
      comercio = { id: data.id, legajo: data.legajo, nombre: data.nombre_comercio };
    } else {
      comercio = await comercioDeSesion(req, sb, body.comercio_id);
    }
    const volverA = admin ? urlDeVueltaAdmin(req, body.volver_a) : urlDeVuelta(body.volver_a);

    const { data: proveedor, error } = await sb
      .from("proveedores_pago")
      .select("activo, sandbox")
      .eq("codigo", "ecartpay")
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!proveedor?.activo) throw new HttpError(409, "Los cobros con tarjeta no están habilitados");

    const app = appOAuth();
    if (!app) throw new HttpError(500, "Los cobros con tarjeta todavía no están configurados");

    // Limpieza oportunista de intentos vencidos.
    await sb.from("oauth_estados").delete().lt("vence_at", new Date().toISOString());

    const { data: estado, error: errEstado } = await sb
      .from("oauth_estados")
      .insert({
        proveedor: "ecartpay",
        comercio_id: comercio.id,
        usuario_id: auth.user.id,
        entorno: proveedor.sandbox ? "sandbox" : "produccion",
        volver_a: volverA,
      })
      .select("state")
      .single();
    if (errEstado) throw new HttpError(500, errEstado.message);

    const url = urlAutorizacionOAuth(
      baseUrlEcartPay(proveedor.sandbox),
      app.clientId,
      redirectUriOAuth(),
      estado.state,
    );
    return json({ url, comercio: { id: comercio.id, nombre: comercio.nombre } });
  }),
);
