// Edge Function: registro inicial del portal empresas.
// 1) Crea el usuario en Supabase Auth SIN confirmar (admin_via_edge=true para que
//    el trigger on_auth_admin_user_created NO cree fila en admin_users).
// 2) Genera un token de verificación de correo y lo persiste.
// 3) Envía el email de verificación por Resend con el link /verificar-correo.
// Rollback: si falla el envío, borra el usuario para poder reintentar.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { handler, json } from "../_shared/http.ts";
import { sendEmail, verificationEmail } from "../_shared/email.ts";

Deno.serve(
  handler(async (req) => {
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) return json({ error: "Falta configuración del servidor" }, 500);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Body inválido" }, 400);
    }

    const { email, password, nombre, apellido, fechaNac, tipoCuenta } = body ?? {};
    if (!email || !password || !nombre || !apellido || !tipoCuenta) {
      return json({ error: "Faltan datos del registro" }, 400);
    }

    const sb = createClient(url, service, { auth: { autoRefreshToken: false } });

    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { admin_via_edge: true, nombre, apellido, tipoCuenta },
    });
    if (authErr || !authData.user) {
      const raw = (authErr?.message ?? "").toLowerCase();
      const isDup =
        (raw.includes("already") && raw.includes("registered")) ||
        raw.includes("already exists") ||
        raw.includes("duplicate") ||
        raw.includes("already been");
      if (isDup) {
        return json(
          {
            error:
              "Ya existe una cuenta con ese correo. Si ya te registraste, iniciá sesión. Si no verificaste tu correo, revisá tu bandeja/spam o usá '¿No te llegó el email de verificación?' en el login para reenviarlo. Si olvidaste la contraseña, usá '¿Olvidaste tu contraseña?'.",
          },
          400,
        );
      }
      return json({ error: authErr?.message ?? "No se pudo crear el usuario" }, 400);
    }
    const authId = authData.user.id;

    try {
      const token = crypto.randomUUID();
      const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const { error: tErr } = await sb.from("verificaciones_correo").insert({
        token,
        user_id: authId,
        correo: email,
        expires_at: expires,
      });
      if (tErr) throw tErr;

      // Crear fila en clientes con estado inicial pendiente_verificacion para que aparezca en el panel admin.
      // CUIT placeholder único con prefijo 99 (no colisiona con CUITs reales 20/27/30/33).
      // Si ya existe fila con ese correo (ej: borrado lógico previo con estado deshabilitado/eliminado o intento fallido), reusarla.
      const tipoPersona = tipoCuenta === "juridica" ? "juridica" : "fisica";
      const nombreCompleto = `${nombre} ${apellido}`.trim();
      let clienteLegajo: string | null = null;
      const { data: existente } = await sb
        .from("clientes")
        .select("legajo")
        .eq("correo", email)
        .maybeSingle();
      if (existente) {
        let lastUpdErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const placeholderCuit = generatePlaceholderCuit(authId, email, attempt);
          const { data: updRow, error: updErr } = await sb
            .from("clientes")
            .update({
              tipo_persona: tipoPersona,
              nombre: nombreCompleto,
              cuit: placeholderCuit,
              estado: "pendiente_verificacion",
              estado_onboarding: "pendiente",
              email_verificado: false,
              onboarding_completo: false,
            })
            .eq("correo", email)
            .select("legajo")
            .single();
          if (!updErr && updRow) {
            clienteLegajo = updRow.legajo;
            lastUpdErr = null;
            break;
          }
          lastUpdErr = updErr;
          const msg = updErr?.message ?? "";
          const isDup =
            msg.includes("clientes_cuit_key") ||
            msg.includes("clientes_legajo_key") ||
            msg.includes("duplicate");
          if (!isDup) break;
        }
        if (lastUpdErr) throw lastUpdErr;
      } else {
        let lastInsertErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const placeholderCuit = generatePlaceholderCuit(authId, email, attempt);
          const { data: cliRow, error: cliInsErr } = await sb
            .from("clientes")
            .insert({
              tipo_persona: tipoPersona,
              correo: email,
              nombre: nombreCompleto,
              cuit: placeholderCuit,
              estado: "pendiente_verificacion",
              estado_onboarding: "pendiente",
              email_verificado: false,
              onboarding_completo: false,
            })
            .select("legajo")
            .single();
          if (!cliInsErr && cliRow) {
            clienteLegajo = cliRow.legajo;
            lastInsertErr = null;
            break;
          }
          lastInsertErr = cliInsErr;
          const msg = cliInsErr?.message ?? "";
          const isDupCuit =
            msg.includes("clientes_cuit_key") ||
            msg.includes("clientes_legajo_key") ||
            msg.includes("duplicate");
          const isDupCorreo = msg.includes("clientes_correo_key");
          if (isDupCorreo) {
            // Carrera: otro proceso insertó entre el select y el insert; reintentar como update
            const { data: retryUpd, error: retryErr } = await sb
              .from("clientes")
              .update({
                tipo_persona: tipoPersona,
                nombre: nombreCompleto,
                cuit: placeholderCuit,
                estado: "pendiente_verificacion",
                estado_onboarding: "pendiente",
                email_verificado: false,
                onboarding_completo: false,
              })
              .eq("correo", email)
              .select("legajo")
              .single();
            if (!retryErr && retryUpd) {
              clienteLegajo = retryUpd.legajo;
              lastInsertErr = null;
              break;
            }
            lastInsertErr = retryErr;
            break;
          }
          if (!isDupCuit) break;
        }
        if (lastInsertErr) throw lastInsertErr;
      }

      const sent = await sendEmail(verificationEmail(email, nombreCompleto, token));
      return json({
        ok: true,
        email,
        legajo: clienteLegajo,
        ...(sent ? {} : { demo_token: token }),
      });
    } catch (e: any) {
      // Rollback coordinado: borrar cliente placeholder, token y usuario para permitir reintento limpio
      try {
        await sb.from("clientes").delete().eq("correo", email);
      } catch {
        /* ignore */
      }
      try {
        await sb.from("verificaciones_correo").delete().eq("user_id", authId);
      } catch {
        /* ignore */
      }
      await sb.auth.admin.deleteUser(authId);
      return json({ error: e?.message ?? "No se pudo enviar el correo de verificación" }, 400);
    }
  }),
);

function generatePlaceholderCuit(authId: string, email: string, attempt: number): string {
  // Prefijo 99 no usado en CUITs reales; 9 dígitos restantes pseudo-aleatorios derivados de authId+email+attempt
  const seed = `${authId}:${email}:${attempt}:${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const abs = Math.abs(hash);
  // Mezclar con random para evitar colisión entre reintentos rápidos
  const rand = Math.floor(Math.random() * 1_000_000_000);
  const combined = (abs ^ rand) % 1_000_000_000;
  const nine = String(combined).padStart(9, "0");
  return `99${nine}`;
}
