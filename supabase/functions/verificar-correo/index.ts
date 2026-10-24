// Edge Function: verifica el token del link de correo y marca el email como confirmado.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ error: "Falta configuración del servidor" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const token = body?.token;
  if (!token) return json({ error: "Falta el token" }, 400);

  const sb = createClient(url, service, { auth: { autoRefreshToken: false } });

  const { data: row, error: rErr } = await sb
    .from("verificaciones_correo")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (rErr) return json({ error: "Error al consultar el token" }, 500);
  if (!row || row.usado || new Date(row.expires_at).getTime() < Date.now()) {
    return json({ error: "El token es inválido o expiró" }, 400);
  }

  await sb.from("verificaciones_correo").update({ usado: true }).eq("token", token);

  const { error: uErr } = await sb.auth.admin.updateUserById(row.user_id, { email_confirm: true });
  if (uErr) return json({ error: uErr.message ?? "No se pudo confirmar el correo" }, 400);

  // Transición de negocio: pendiente_verificacion -> registrado (homologado con admin)
  try {
    const { data: cli } = await sb.from("clientes").select("id, estado, email_verificado").eq("correo", row.correo).maybeSingle();
    if (cli && cli.estado === "pendiente_verificacion") {
      await sb.from("clientes").update({ estado: "registrado", email_verificado: true }).eq("correo", row.correo);
    } else if (cli) {
      await sb.from("clientes").update({ email_verificado: true }).eq("correo", row.correo);
    }
  } catch { /* no bloquear verificación si falla el update de negocio */ }

  return json({ ok: true });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
