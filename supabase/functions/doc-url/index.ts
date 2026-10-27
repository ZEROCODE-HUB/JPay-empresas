import { createClient } from "jsr:@supabase/supabase-js@2";
import { brand } from "../_shared/brand.ts";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const headers = { ...cors, "content-type": "application/json" };

  const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!auth) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userSb = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: u } = await userSb.auth.getUser(auth);
  const email = u.user?.email;
  if (!email) return new Response(JSON.stringify({ error: "invalid" }), { status: 401, headers });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const paths: unknown = Array.isArray(body?.paths) ? body.paths : body?.path ? [body.path] : null;
  if (!Array.isArray(paths)) {
    return new Response(JSON.stringify({ error: "missing paths" }), { status: 400, headers });
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // PENDIENTE (ver PENDIENTES.md): decidir por rol, no por dominio de email.
  const isAdmin = email.endsWith(`@${brand.web.domain}`);

  // Batch: traer todos los documentos de una vez para evitar N+1
  const strPaths = (paths as unknown[]).filter((p): p is string => typeof p === "string");
  const { data: docs } = await admin
    .from("documentos")
    .select("url, cliente_legajo")
    .in("url", strPaths);
  const docMap = new Map<string, string>();
  for (const d of (docs ?? []) as any[]) docMap.set(d.url, d.cliente_legajo);
  const legajos = [...new Set([...docMap.values()])];
  const clienteMap = new Map<string, string>();
  if (legajos.length > 0) {
    const { data: clientes } = await admin
      .from("clientes")
      .select("legajo, correo")
      .in("legajo", legajos);
    for (const c of (clientes ?? []) as any[]) clienteMap.set(c.legajo, c.correo);
  }

  const out: Record<string, string | null> = {};
  // Filtrar por permiso antes de firmar
  const toSign: string[] = [];
  for (const p of strPaths) {
    const legajo = docMap.get(p);
    if (legajo) {
      const correo = clienteMap.get(legajo);
      if (correo && correo !== email && !isAdmin) {
        out[p] = null;
        continue;
      }
    } else if (!isAdmin) {
      out[p] = null;
      continue;
    }
    toSign.push(p);
  }
  // Firmar en paralelo
  const signed = await Promise.all(
    toSign.map(async (p) => {
      const { data: s } = await admin.storage.from("kyc").createSignedUrl(p, 3600);
      return [p, s?.signedUrl ?? null] as const;
    }),
  );
  for (const [p, url] of signed) out[p] = url;

  return new Response(JSON.stringify({ urls: out }), { headers });
});
