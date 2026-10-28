// Edge Function: inicia la conexión del comercio con Ecart Pay (OAuth, Fase 3).
// Crea un `state` de un solo uso (oauth_estados, vence en 60 minutos) ligado al usuario y al
// comercio, y devuelve la URL de Ecart Pay a la que el portal tiene que mandar al usuario.
// Body: { comercio_id?: string, volver_a?: string }.

import { comercioDeSesion, urlDeVuelta } from "../_shared/conexiones.ts";
import {
  appOAuth,
  baseUrlEcartPay,
  redirectUriOAuth,
  urlAutorizacionOAuth,
} from "../_shared/ecartpay.ts";
import { handler, HttpError, json, readJson, serviceClient, userClient } from "../_shared/http.ts";

Deno.serve(
  handler(async (req) => {
    const body = await readJson<{ comercio_id?: string; volver_a?: string }>(req);
    const sb = serviceClient();

    const { data: auth } = await userClient(req).auth.getUser();
    if (!auth?.user) throw new HttpError(401, "Sesión inválida");
    const comercio = await comercioDeSesion(req, sb, body.comercio_id);

    const { data: proveedor, error } = await sb
      .from("proveedores_pago")
      .select("activo, sandbox")
      .eq("codigo", "ecartpay")
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!proveedor?.activo) throw new HttpError(409, "Ecart Pay no está habilitado");

    const app = appOAuth();
    if (!app) throw new HttpError(500, "Falta configurar la aplicación OAuth de Ecart Pay");

    // Limpieza oportunista de intentos vencidos.
    await sb.from("oauth_estados").delete().lt("vence_at", new Date().toISOString());

    const { data: estado, error: errEstado } = await sb
      .from("oauth_estados")
      .insert({
        proveedor: "ecartpay",
        comercio_id: comercio.id,
        usuario_id: auth.user.id,
        entorno: proveedor.sandbox ? "sandbox" : "produccion",
        volver_a: urlDeVuelta(body.volver_a),
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
