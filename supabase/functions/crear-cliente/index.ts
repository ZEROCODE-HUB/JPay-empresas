// Edge Function: completa el alta del cliente (paso final del onboarding).
// El usuario de Auth ya fue creado en el registro (registrar-cliente); aquí
// sólo se inserta la fila en clientes (legajo auto-derivado), se sube el KYC
// al bucket privado 'kyc', se registran documentos y la validación inicial.
// Rollback coordinado: si falla algo post-inserción de clientes, se borra la fila.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { handler, json } from "../_shared/http.ts";

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

    const { email, tipoCuenta, nombre, perfil = {}, kyc = {} } = body ?? {};
    // `cuit` es el nombre anterior de `taxId` (clientes que todavía no envían país).
    const pais: string = body?.pais ?? "AR";
    const taxIdCrudo = String(body?.taxId ?? body?.cuit ?? "");
    if (!email || !tipoCuenta || !nombre || !taxIdCrudo) {
      return json({ error: "Faltan email, tipoCuenta, nombre o identificador fiscal" }, 400);
    }
    const tipoPersona = tipoCuenta === "juridica" ? "juridica" : "fisica";
    const fiscal = identificadorFiscal(pais, tipoPersona, taxIdCrudo);
    if ("error" in fiscal) return json({ error: fiscal.error }, 400);
    const etiquetaFiscal = fiscal.tipo === "CUIT" ? "CUIT" : fiscal.tipo;

    const sb = createClient(url, service, { auth: { autoRefreshToken: false } });

    // Columnas comunes al alta y a la actualización. En Argentina el CUIT es además el
    // identificador interno (`cuit`, del que deriva el legajo); en otros países ese número
    // interno es el provisorio con prefijo 99 que asignó el registro y no se toca.
    const datos = {
      tipo_persona: tipoPersona,
      nombre,
      pais,
      tax_id: fiscal.valor,
      tax_id_tipo: fiscal.tipo,
      id_personal: limpiarId(perfil.idPersonal),
      id_personal_tipo: perfil.idPersonal ? (pais === "MX" ? "CURP" : null) : null,
      regimen_fiscal: perfil.regimenFiscal ?? null,
      cuenta_bancaria: limpiarId(perfil.cuentaBancaria),
      cuenta_bancaria_tipo: perfil.cuentaBancaria ? (pais === "MX" ? "CLABE" : "CBU") : null,
      genero: perfil.genero ?? null,
      cuit_cuil: pais === "AR" ? (perfil.cuitCuil ?? fiscal.valor) : null,
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
      email_verificado: true,
      onboarding_completo: true,
    };
    const errorDuplicado = (msg: string) =>
      msg.includes("clientes_legajo_key") ||
      msg.includes("clientes_cuit_key") ||
      msg.includes("clientes_pais_tax_id_key")
        ? `Ya existe una cuenta con ese ${etiquetaFiscal}`
        : null;

    // Si el usuario ya tiene fila en pendiente_verificacion/registrado (creada por registrar-cliente), hacer UPDATE en lugar de INSERT
    let legajo: string;
    let clienteId: string | null = null;
    const { data: existente } = await sb
      .from("clientes")
      .select("legajo, cuit, estado, id")
      .eq("correo", email)
      .maybeSingle();
    const esAltaNueva = !existente;

    if (existente) {
      const { data: upd, error: updErr } = await sb
        .from("clientes")
        .update({
          ...datos,
          ...(pais === "AR" ? { cuit: fiscal.valor } : {}),
          // Transición homologada: si venía de pendiente_verificacion pasa a registrado tras completar KYC
          estado: existente.estado === "pendiente_verificacion" ? "registrado" : existente.estado,
        })
        .eq("correo", email)
        .select("legajo, id")
        .single();
      if (updErr || !upd) {
        const msg = updErr?.message ?? "";
        return json(
          { error: errorDuplicado(msg) ?? (msg || "No se pudo actualizar el cliente") },
          400,
        );
      }
      legajo = upd.legajo;
      clienteId = upd.id;
    } else {
      const { data: cli, error: cliErr } = await sb
        .from("clientes")
        .insert({
          ...datos,
          correo: email,
          cuit: pais === "AR" ? fiscal.valor : numeroInterno(),
          estado: "registrado",
        })
        .select("legajo, id")
        .single();

      if (cliErr || !cli) {
        const msg = cliErr?.message ?? "";
        const dupCorreo = msg.includes("clientes_correo_key");
        return json(
          {
            error: dupCorreo
              ? "Ya existe una cuenta con ese correo"
              : (errorDuplicado(msg) ?? (msg || "No se pudo crear el cliente")),
          },
          400,
        );
      }
      legajo = cli.legajo;
      clienteId = (cli as any).id;
    }

    // Representante legal de una cuenta jurídica (datos KYB del alta en Cobre). No frena el alta:
    // si falta algo se completa después en Mi cuenta.
    const rep = perfil.representante as Record<string, string | null> | undefined;
    if (pais === "MX" && rep?.nombre && rep.idNumero && rep.fechaNacimiento) {
      const { error: repErr } = await sb.from("cliente_personas_kyb").insert({
        cliente_legajo: legajo,
        rol: "representante",
        nombre: rep.nombre,
        apellido: rep.apellido || rep.nombre,
        id_tipo: rep.idTipo === "curp" ? "curp" : "rfc",
        id_numero: limpiarId(rep.idNumero) ?? rep.idNumero,
        nacionalidades: ["MEX"],
        fecha_nacimiento: rep.fechaNacimiento,
      });
      if (repErr) console.warn("No se guardó el representante legal:", repErr.message);
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
  }),
);

/** Identificador fiscal normalizado y validado según el país (mismas reglas que `src/shared/validadores.ts`). */
function identificadorFiscal(
  pais: string,
  tipoPersona: "fisica" | "juridica",
  crudo: string,
): { tipo: string; valor: string } | { error: string } {
  if (pais === "AR") {
    const cuit = crudo.replace(/\D/g, "");
    return /^[0-9]{11}$/.test(cuit)
      ? { tipo: "CUIT", valor: cuit }
      : { error: "El CUIT debe tener 11 dígitos" };
  }
  if (pais === "MX") {
    const rfc = crudo.replace(/[\s-]/g, "").toUpperCase();
    const largo = tipoPersona === "juridica" ? 12 : 13;
    const patron =
      tipoPersona === "juridica" ? /^[A-ZÑ&]{3}\d{6}[A-Z\d]{3}$/ : /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/;
    return patron.test(rfc)
      ? { tipo: "RFC", valor: rfc }
      : { error: `El RFC debe tener ${largo} caracteres con formato válido` };
  }
  return { error: `País no soportado: ${pais}` };
}

const limpiarId = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.replace(/[\s-]/g, "").toUpperCase() : null;

/** Número interno de 11 dígitos con prefijo 99 (mismo esquema que registrar-cliente). */
function numeroInterno(): string {
  return `99${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`;
}

function decode(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
}
