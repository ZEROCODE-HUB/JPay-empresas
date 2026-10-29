// Alta del comercio en Cobre (Solution Design §3.1 y §4.1): Subcliente KYB → al `approved`, su
// Cobre Balance México (`pr_mex_cobre3` con `subclient_id`). La CLABE del Balance queda en la
// subcuenta receptora (por defecto la subcuenta activa más antigua del comercio).
// Lo usan `cobre-subclientes` (alta y consulta), `cobre-webhook` (`subclient.status.*`) y la
// revisión de pendientes. Solo en la instancia matriz: un comercio con instancia propia no tiene
// Subcliente bajo JPay.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { estadoSubcliente, type DatosSubcliente, type PersonaKyb } from "./cobre.ts";
import type { ConexionCobre } from "./cobre-servidor.ts";

type Obj = Record<string, unknown>;

export type FilaSubcliente = {
  id: string;
  cliente_legajo: string;
  modo: string;
  subcliente_externo_id: string | null;
  estado: string;
  balance_pedido_at: string | null;
};

/** Datos KYB del comercio tal como están en JPay (para validar y armar el alta). */
export async function datosKybDeCliente(
  sb: SupabaseClient,
  legajo: string,
): Promise<DatosSubcliente> {
  const [{ data: c, error }, { data: personas }] = await Promise.all([
    sb
      .from("clientes")
      .select(
        "legajo, nombre, nombre_legal, nombre_fantasia, tax_id, correo, telefono, sitio_web, industria_cobre, fecha_inscripcion, pais_constitucion, pais_operacion, direccion, direccion2, ciudad, provincia, cp",
      )
      .eq("legajo", legajo)
      .maybeSingle(),
    sb
      .from("cliente_personas_kyb")
      .select("rol, nombre, apellido, id_tipo, id_numero, nacionalidades, fecha_nacimiento")
      .eq("cliente_legajo", legajo)
      .order("created_at"),
  ]);
  if (error) throw new Error(error.message);
  if (!c) throw new Error("Cliente inexistente");
  const persona = (p: Obj): PersonaKyb => ({
    nombre: String(p.nombre ?? ""),
    apellido: String(p.apellido ?? ""),
    idTipo: p.id_tipo === "curp" ? "curp" : "rfc",
    idNumero: String(p.id_numero ?? ""),
    nacionalidades: (p.nacionalidades as string[] | null) ?? [],
    fechaNacimiento: String(p.fecha_nacimiento ?? ""),
  });
  const lista = (personas ?? []) as Obj[];
  const calle = [c.direccion, c.direccion2].filter(Boolean).join(", ");
  return {
    razonSocial: c.nombre_legal || c.nombre || "",
    nombreCorto: c.nombre_fantasia || c.nombre_legal || c.nombre || "",
    rfc: c.tax_id ?? "",
    correo: c.correo ?? "",
    telefono: c.telefono ?? "",
    sitioWeb: c.sitio_web ?? "",
    industria: c.industria_cobre ?? "",
    fechaConstitucion: c.fecha_inscripcion ? String(c.fecha_inscripcion).slice(0, 10) : "",
    paisConstitucion: c.pais_constitucion ?? "MEX",
    paisOperacion: c.pais_operacion ?? "MEX",
    domicilio: {
      calle,
      ciudad: c.ciudad ?? "",
      estado: c.provincia ?? "",
      cp: c.cp ?? "",
      pais: "MEX",
    },
    representantes: lista.filter((p) => p.rol === "representante").map(persona),
    ubos: lista.filter((p) => p.rol === "beneficiario").map(persona),
  };
}

/**
 * Aplica el estado de un Subcliente (respuesta de GET /subclients/{id} o `content` del aviso).
 * Al `approved` crea el Cobre Balance del comercio (una sola vez).
 */
export async function aplicarEstadoSubcliente(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  sc: unknown,
): Promise<string> {
  const { id, estado, motivo } = estadoSubcliente(sc);
  if (!id || !estado) return "sin estado";
  const { data: fila } = await sb
    .from("cobre_subclientes")
    .select("id, cliente_legajo, modo, subcliente_externo_id, estado, balance_pedido_at")
    .eq("modo", conexion.modo)
    .eq("subcliente_externo_id", id)
    .maybeSingle();
  if (!fila) return "desconocido";
  const final = ["approved", "rejected", "failed"];
  if (!final.includes(fila.estado) && fila.estado !== estado) {
    const { error } = await sb
      .from("cobre_subclientes")
      .update({ estado, motivo, updated_at: new Date().toISOString() })
      .eq("id", fila.id);
    if (error) throw new Error(error.message);
  }
  const vigente = final.includes(fila.estado) ? fila.estado : estado;
  if (vigente === "approved") {
    const r = await crearBalanceComercio(sb, conexion, { ...fila, estado: "approved" });
    return `approved (${r})`;
  }
  return vigente;
}

/** Crea el Cobre Balance México del comercio con su Subcliente aprobado (una sola vez). */
export async function crearBalanceComercio(
  sb: SupabaseClient,
  conexion: ConexionCobre,
  fila: FilaSubcliente,
): Promise<string> {
  const { data: existente } = await sb
    .from("cobre_cuentas")
    .select("id")
    .eq("tipo", "cliente")
    .eq("cliente_legajo", fila.cliente_legajo)
    .eq("modo", conexion.modo)
    .eq("estado", "activa")
    .maybeSingle();
  if (existente) return "Balance ya creado";

  // Toma del pedido: si otro proceso lo está creando (aviso y consulta a la vez), no se duplica.
  const hace5min = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: tomado } = await sb
    .from("cobre_subclientes")
    .update({ balance_pedido_at: new Date().toISOString() })
    .eq("id", fila.id)
    .or(`balance_pedido_at.is.null,balance_pedido_at.lt.${hace5min}`)
    .select("id")
    .maybeSingle();
  if (!tomado) return "Balance en creación";

  const [{ data: cli }, { data: subs }] = await Promise.all([
    sb
      .from("clientes")
      .select("nombre, nombre_fantasia")
      .eq("legajo", fila.cliente_legajo)
      .maybeSingle(),
    sb
      .from("subaccounts")
      .select("id, moneda")
      .eq("cliente_legajo", fila.cliente_legajo)
      .eq("estado", "Activa")
      .order("created_at"),
  ]);
  const receptora = ((subs ?? []) as { id: string; moneda: string | null }[]).find(
    (s) => !s.moneda || s.moneda === "MXN",
  );
  const nombre = (cli?.nombre_fantasia || cli?.nombre || fila.cliente_legajo).slice(0, 20);
  const cuenta = await conexion.cliente.post<{
    id: string;
    account_number?: string | null;
    connectivity?: { status?: string };
  }>("/accounts", {
    provider_id: "pr_mex_cobre3",
    action: "create",
    subclient_id: fila.subcliente_externo_id,
    tags: [`jpay-${fila.cliente_legajo}`],
    alias: `JPAY ${nombre}`.slice(0, 32),
  });
  const clabe = /^\d{18}$/.test(cuenta.account_number ?? "") ? cuenta.account_number! : null;
  const { data: nueva, error } = await sb
    .from("cobre_cuentas")
    .insert({
      tipo: "cliente",
      cliente_legajo: fila.cliente_legajo,
      modo: conexion.modo,
      cuenta_externa_id: cuenta.id,
      clabe,
      alias: `JPAY ${nombre}`.slice(0, 32),
      subcliente_id: fila.id,
      subcuenta_id: receptora?.id ?? null,
      conectividad: cuenta.connectivity?.status ?? null,
    })
    .select("id")
    .single();
  if (error)
    throw new Error(`Balance ${cuenta.id} creado en Cobre pero no guardado: ${error.message}`);
  if (clabe && receptora)
    await asignarClabeReceptora(
      sb,
      conexion.modo,
      nueva.id,
      receptora.id,
      fila.cliente_legajo,
      clabe,
    );
  return clabe ? `Balance ${cuenta.id}, CLABE ${clabe}` : `Balance ${cuenta.id}`;
}

/** La CLABE del Balance pasa a la subcuenta receptora (y deja la anterior, si había otra). */
export async function asignarClabeReceptora(
  sb: SupabaseClient,
  modo: string,
  cuentaId: string,
  subcuentaId: string,
  legajo: string,
  clabe: string,
): Promise<void> {
  const ahora = new Date().toISOString();
  const { data: previas } = await sb
    .from("cobre_clabes")
    .select("id, subcuenta_id, clabe")
    .eq("modo", modo)
    .eq("cuenta_id", cuentaId)
    .eq("estado", "activa");
  for (const p of (previas ?? []) as { id: string; subcuenta_id: string; clabe: string }[]) {
    if (p.subcuenta_id === subcuentaId && p.clabe === clabe) return;
    await sb
      .from("cobre_clabes")
      .update({ estado: "deshabilitada", deshabilitada_at: ahora })
      .eq("id", p.id);
    await sb.from("subaccounts").update({ cbu: null }).eq("id", p.subcuenta_id).eq("cbu", p.clabe);
  }
  // CLABE virtual del modelo anterior en esa subcuenta: queda sin uso.
  await sb
    .from("cobre_clabes")
    .update({ estado: "deshabilitada", deshabilitada_at: ahora })
    .eq("modo", modo)
    .eq("subcuenta_id", subcuentaId)
    .eq("estado", "activa");
  const { error } = await sb.from("cobre_clabes").insert({
    subcuenta_id: subcuentaId,
    cliente_legajo: legajo,
    cuenta_id: cuentaId,
    modo,
    clabe,
    referencia_externa_id: null,
  });
  if (error) throw new Error(error.message);
  await sb.from("cobre_cuentas").update({ subcuenta_id: subcuentaId }).eq("id", cuentaId);
  await sb.from("subaccounts").update({ cbu: clabe }).eq("id", subcuentaId);
}
