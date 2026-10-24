// Edge Function: verifica OTP de transferencia (6 dígitos).
// Requiere usuario autenticado. Valida contra tabla otp_transferencias.

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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service) return json({ error: "Falta configuración del servidor" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const codigoRaw: string = String(body?.codigo ?? "").trim();
  if (!/^\d{6}$/.test(codigoRaw)) return json({ error: "Código inválido" }, 400);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "No autenticado" }, 401);

  const sbAdmin = createClient(url, service, { auth: { autoRefreshToken: false } });
  let email: string | null = null;

  const { data: userData, error: userErr } = await sbAdmin.auth.getUser(token);
  if (!userErr && userData?.user?.email) {
    email = userData.user.email.toLowerCase().trim();
  } else if (anonKey) {
    const sbAnon = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false },
    });
    const { data: anonUser, error: anonErr } = await sbAnon.auth.getUser();
    if (!anonErr && anonUser?.user?.email) email = anonUser.user.email.toLowerCase().trim();
  }
  if (!email) return json({ error: "Sesión inválida o expirada" }, 401);

  // Buscar OTP válido más reciente no usado y no expirado
  const { data: row, error: rErr } = await sbAdmin
    .from("otp_transferencias")
    .select("id, codigo, expires_at, usado, intentos")
    .eq("correo", email)
    .eq("usado", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rErr) return json({ error: "Error al verificar el código" }, 500);
  if (!row) return json({ error: "No hay código pendiente o ya fue usado" }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sbAdmin.from("otp_transferencias").update({ usado: true }).eq("id", row.id);
    return json({ error: "El código expiró. Pedí uno nuevo." }, 400);
  }
  // Limitar intentos
  if ((row.intentos ?? 0) >= 5) {
    await sbAdmin.from("otp_transferencias").update({ usado: true }).eq("id", row.id);
    return json({ error: "Demasiados intentos. Pedí un nuevo código." }, 429);
  }

  if (row.codigo !== codigoRaw) {
    await sbAdmin.from("otp_transferencias").update({ intentos: (row.intentos ?? 0) + 1 }).eq("id", row.id);
    return json({ error: "Código incorrecto" }, 400);
  }

  // Éxito: marcar usado
  await sbAdmin.from("otp_transferencias").update({ usado: true }).eq("id", row.id);
  return json({ ok: true });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
