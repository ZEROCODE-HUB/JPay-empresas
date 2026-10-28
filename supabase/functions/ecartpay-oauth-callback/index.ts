// Edge Function PÚBLICA (desplegar con --no-verify-jwt): Ecart Pay redirige acá al comercio
// después de autorizar, con ?code&state. La autenticidad la da el `state` (de un solo uso,
// creado por `ecartpay-oauth-inicio` para un usuario y un comercio).
// 1) Consume el state. 2) Canjea el code por las claves del comercio. 3) Verifica las claves
// pidiendo un token. 4) Guarda la conexión (private_id en Vault). 5) Vuelve al portal con
// ?ecartpay=conectado o ?ecartpay=error&motivo=...

import { conResultado } from "../_shared/conexiones.ts";
import {
  appOAuth,
  baseUrlEcartPay,
  canjearCodigoOAuth,
  EcartPayCliente,
  EcartPayError,
  redirectUriOAuth,
} from "../_shared/ecartpay.ts";
import { serviceClient } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!UUID.test(state)) return pagina("El enlace de conexión no es válido.", 400);

  const sb = serviceClient();
  // Consumir el state de forma atómica: solo el primer uso, y si no venció.
  const { data: estado } = await sb
    .from("oauth_estados")
    .update({ usado_at: new Date().toISOString() })
    .eq("state", state)
    .is("usado_at", null)
    .gt("vence_at", new Date().toISOString())
    .select("comercio_id, entorno, volver_a")
    .maybeSingle();
  if (!estado) {
    return pagina("El enlace de conexión venció o ya se usó. Volvé a intentarlo desde JPay.", 400);
  }
  const volver = (r: Record<string, string>) =>
    Response.redirect(conResultado(estado.volver_a, r), 302);

  const errorProveedor = url.searchParams.get("error");
  if (errorProveedor || !code) {
    return volver({
      ecartpay: "error",
      motivo: errorProveedor ?? "Ecart Pay no devolvió el código",
    });
  }

  const app = appOAuth();
  if (!app) return volver({ ecartpay: "error", motivo: "Falta configurar la app OAuth" });
  const baseUrl = baseUrlEcartPay(estado.entorno === "sandbox");

  try {
    const cred = await canjearCodigoOAuth({ baseUrl, app, code, redirectUri: redirectUriOAuth() });
    // Las claves tienen que servir para operar: se pide un token con ellas.
    await new EcartPayCliente({
      baseUrl,
      credenciales: { publicKey: cred.publicId, privateKey: cred.privateId },
    }).token(true);

    const { data: conexion, error } = await sb
      .from("comercio_proveedores")
      .upsert(
        {
          comercio_id: estado.comercio_id,
          proveedor: "ecartpay",
          entorno: estado.entorno,
          estado: "conectado",
          cuenta_externa_id: cred.accountId || null,
          public_id: cred.publicId,
          scopes: cred.scopes,
          conectado_at: new Date().toISOString(),
          revocado_at: null,
          ultimo_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "comercio_id,proveedor,entorno" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: errSecreto } = await sb.rpc("proveedor_guardar_secreto", {
      p_conexion_id: conexion.id,
      p_secreto: cred.privateId,
    });
    if (errSecreto) throw new Error(errSecreto.message);

    return volver({ ecartpay: "conectado" });
  } catch (e) {
    const motivo =
      e instanceof EcartPayError ? `${e.message} (HTTP ${e.status})` : (e as Error).message;
    await sb
      .from("comercio_proveedores")
      .update({ ultimo_error: motivo.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("comercio_id", estado.comercio_id)
      .eq("proveedor", "ecartpay")
      .eq("entorno", estado.entorno);
    return volver({ ecartpay: "error", motivo: motivo.slice(0, 200) });
  }
});

/** Página mínima para los errores en los que no se sabe a dónde volver. */
function pagina(mensaje: string, status: number): Response {
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexión con Ecart Pay</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.25rem">No se pudo conectar la cuenta</h1><p>${mensaje}</p></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}
