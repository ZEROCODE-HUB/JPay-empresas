// Edge Function: completa el alta del cliente (paso final del onboarding).
// El usuario de Auth ya fue creado en el registro (registrar-cliente); aquí
// sólo se inserta la fila en clientes (legajo auto-derivado), se sube el KYC
// al bucket privado 'kyc', se registran documentos y la validación inicial.
// Rollback coordinado: si falla algo post-inserción de clientes, se borra la fila.

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

  const { email, tipoCuenta, nombre, cuit, perfil = {}, kyc = {} } = body ?? {};
  if (!email || !tipoCuenta || !nombre || !cuit) {
    return json({ error: "Faltan email, tipoCuenta, nombre o cuit" }, 400);
  }
  if (!/^[0-9]{11}$/.test(String(cuit).replace(/\D/g, ""))) {
    return json({ error: "El CUIT debe tener 11 dígitos" }, 400);
  }
  const tipoPersona = tipoCuenta === "juridica" ? "juridica" : "fisica";

  const sb = createClient(url, service, { auth: { autoRefreshToken: false } });

  // Si el usuario ya tiene fila en pendiente_verificacion/registrado (creada por registrar-cliente), hacer UPDATE en lugar de INSERT
  const cuitNorm = String(cuit).replace(/\D/g, "");
  let legajo: string;
  let clienteId: string | null = null;
  const { data: existente } = await sb.from("clientes").select("legajo, cuit, estado, id").eq("correo", email).maybeSingle();
  const esAltaNueva = !existente;

  if (existente) {
    const isPlaceholder = existente.cuit.startsWith("99");
    // Si el registro previo es placeholder, permitimos actualizar CUIT/legajo al real
    const { data: upd, error: updErr } = await sb.from("clientes").update({
      tipo_persona: tipoPersona,
      nombre,
      cuit: cuitNorm,
      genero: perfil.genero ?? null,
      cuit_cuil: perfil.cuitCuil ?? null,
      fecha_nacimiento: perfil.fechaNacimiento ?? null,
      ocupacion: perfil.ocupacion ?? null,
      origen_fondos: perfil.origenFondos ?? null,
      es_pep: !!perfil.esPEP,
      tipo_sociedad: perfil.tipoSociedad ?? null,
      nombre_legal: perfil.nombreLegal ?? null,
      nombre_fantasia: perfil.nombreFantasia ?? null,
      fecha_inscripcion: perfil.fechaInscripcion ?? null,
      direccion: perfil.direccion ?? null,
      direccion2: perfil.direccion2 ?? null,
      ciudad: perfil.ciudad ?? null,
      provincia: perfil.provincia ?? null,
      cp: perfil.cp ?? null,
      estado_onboarding: "pendiente",
      // Transición homologada: si venía de pendiente_verificacion pasa a registrado tras completar KYC
      estado: existente.estado === "pendiente_verificacion" ? "registrado" : existente.estado,
      email_verificado: true,
      onboarding_completo: true,
    }).eq("correo", email).select("legajo, id").single();
    if (updErr || !upd) {
      const msg = updErr?.message ?? "";
      const dupLegajo = msg.includes("clientes_legajo_key") || msg.includes("clientes_cuit_key");
      if (dupLegajo && !isPlaceholder) {
        return json({ error: "Ya existe una cuenta con ese CUIT" }, 400);
      }
      if (dupLegajo) {
        return json({ error: "Ya existe una cuenta con ese CUIT" }, 400);
      }
      return json({ error: msg || "No se pudo actualizar el cliente" }, 400);
    }
    legajo = upd.legajo;
    clienteId = upd.id;
  } else {
    const { data: cli, error: cliErr } = await sb
      .from("clientes")
      .insert({
        tipo_persona: tipoPersona,
        correo: email,
        nombre,
        cuit: cuitNorm,
        genero: perfil.genero ?? null,
        cuit_cuil: perfil.cuitCuil ?? null,
        fecha_nacimiento: perfil.fechaNacimiento ?? null,
        ocupacion: perfil.ocupacion ?? null,
        origen_fondos: perfil.origenFondos ?? null,
        es_pep: !!perfil.esPEP,
        tipo_sociedad: perfil.tipoSociedad ?? null,
        nombre_legal: perfil.nombreLegal ?? null,
        nombre_fantasia: perfil.nombreFantasia ?? null,
        fecha_inscripcion: perfil.fechaInscripcion ?? null,
        direccion: perfil.direccion ?? null,
        direccion2: perfil.direccion2 ?? null,
        ciudad: perfil.ciudad ?? null,
        provincia: perfil.provincia ?? null,
        cp: perfil.cp ?? null,
        estado_onboarding: "pendiente",
        estado: "registrado",
        email_verificado: true,
        onboarding_completo: true,
      })
      .select("legajo, id")
      .single();

    if (cliErr || !cli) {
      const msg = cliErr?.message ?? "";
      const dupCorreo = msg.includes("clientes_correo_key");
      const dupLegajo = msg.includes("clientes_legajo_key") || msg.includes("clientes_cuit_key");
      return json(
        {
          error: dupCorreo
            ? "Ya existe una cuenta con ese correo"
            : dupLegajo
              ? "Ya existe una cuenta con ese CUIT"
              : msg || "No se pudo crear el cliente",
        },
        400,
      );
    }
    legajo = cli.legajo;
    clienteId = (cli as any).id;
  }

  try {
    const docTipos: Record<string, string> = {
      dniFrente: "id_frente",
      dniDorso: "id_dorso",
      servicio: "servicio",
      selfie: "selfie",
    };
    for (const [key, tipo] of Object.entries(docTipos)) {
      const f = kyc[key];
      if (!f || !f.data) continue;
      const ext = (f.name.split(".").pop() || "bin").toLowerCase();
      const path = `${legajo}/${tipo}.${ext}`;
      const bytes = decode(f.data);
      const { error: upErr } = await sb.storage
        .from("kyc")
        .upload(path, bytes, { contentType: f.type || "application/octet-stream", upsert: true });
      if (upErr) throw upErr;
      const { error: docErr } = await sb.from("documentos").insert({
        cliente_legajo: legajo,
        tipo,
        url: path,
        label: f.name,
      });
      if (docErr) throw docErr;
    }

    const { error: valErr } = await sb.from("validaciones").insert({
      cliente_legajo: legajo,
      proveedor: "Alta de cliente",
      estado: "Pendiente",
    });
    if (valErr) throw valErr;

    return json({ ok: true, legajo, email });
  } catch (e: any) {
    if (esAltaNueva) {
      await sb.from("clientes").delete().eq("legajo", legajo);
    }
    return json({ error: e?.message ?? "Error al completar el alta" }, 400);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function decode(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
}
