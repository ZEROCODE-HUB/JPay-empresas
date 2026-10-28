// Edge Function: puntos físicos del comercio en Ecart Pay (Fase 7).
// Sucursal → Caja → Terminal. Escribe primero en Ecart Pay (con las claves del comercio) y
// después en la base, así nunca queda algo en JPay que no exista en el proveedor.
// La usa el comercio dueño o un admin (con `comercio_id`). Body: { accion, comercio_id?, ... }.
//
// Acciones: sincronizar | guardar_sucursal | borrar_sucursal | guardar_caja | borrar_caja |
//           vincular_terminal | desvincular_terminal | modo_terminal

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { clienteDeConexion, comercioDeSesion, conexionEcartPay } from "../_shared/conexiones.ts";
import {
  cajaAEcart,
  cajaDeEcart,
  EcartPayCliente,
  EcartPayError,
  listarTodo,
  sucursalAEcart,
  sucursalDeEcart,
  terminalDeEcart,
  type CajaLocal,
  type SucursalLocal,
} from "../_shared/ecartpay.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

type Body = Record<string, unknown> & { accion?: string; comercio_id?: string };
type Ctx = { sb: SupabaseClient; ecart: EcartPayCliente; comercioId: string };

const ahora = () => new Date().toISOString();
const texto = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    let comercioId: string;
    if (await esAdmin(req)) {
      if (typeof body.comercio_id !== "string") throw new HttpError(400, "Falta comercio_id");
      comercioId = body.comercio_id;
    } else {
      comercioId = (await comercioDeSesion(req, sb, body.comercio_id as string | undefined)).id;
    }
    const conexion = await conexionEcartPay(sb, [comercioId]);
    if (!conexion) throw new HttpError(409, "El comercio no tiene Ecart Pay conectado");
    const ctx: Ctx = { sb, ecart: await clienteDeConexion(sb, conexion), comercioId };

    try {
      switch (body.accion) {
        case "sincronizar":
          return json(await sincronizar(ctx));
        case "guardar_sucursal":
          return json(await guardarSucursal(ctx, body));
        case "borrar_sucursal":
          return json(await borrarSucursal(ctx, body));
        case "guardar_caja":
          return json(await guardarCaja(ctx, body));
        case "borrar_caja":
          return json(await borrarCaja(ctx, body));
        case "vincular_terminal":
          return json(await vincularTerminal(ctx, body, true));
        case "desvincular_terminal":
          return json(await vincularTerminal(ctx, body, false));
        case "modo_terminal":
          return json(await modoTerminal(ctx, body));
        default:
          throw new HttpError(400, "Acción inválida");
      }
    } catch (e) {
      if (e instanceof EcartPayError) {
        const status = e.status >= 400 && e.status < 500 ? 422 : 502;
        throw new HttpError(status, `Ecart Pay: ${e.message}`);
      }
      throw e;
    }
  }),
);

const idCreado = (r: unknown): string => {
  const d = ((r ?? {}) as { data?: Record<string, unknown> }).data ?? {};
  const id = d._id ?? d.id;
  if (typeof id !== "string" || !id) throw new EcartPayError(502, "Ecart Pay no devolvió el id", r);
  return id;
};

async function sucursalDelComercio(ctx: Ctx, id: unknown) {
  if (typeof id !== "string") throw new HttpError(400, "Falta la sucursal");
  const { data, error } = await ctx.sb
    .from("sucursales")
    .select("id, id_externo, comercio_id")
    .eq("id", id)
    .is("eliminado_at", null)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data || data.comercio_id !== ctx.comercioId)
    throw new HttpError(404, "Sucursal inexistente");
  return data;
}

async function cajaDelComercio(ctx: Ctx, id: unknown) {
  if (typeof id !== "string") throw new HttpError(400, "Falta la caja");
  const { data, error } = await ctx.sb
    .from("cajas")
    .select("id, id_externo, terminal_id, sucursal_id, sucursales!inner(comercio_id, id_externo)")
    .eq("id", id)
    .is("eliminado_at", null)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  const suc = (data as { sucursales?: { comercio_id: string; id_externo: string | null } } | null)
    ?.sucursales;
  if (!data || suc?.comercio_id !== ctx.comercioId) throw new HttpError(404, "Caja inexistente");
  return { ...data, sucursalExterna: suc.id_externo };
}

function leerSucursal(b: Body): SucursalLocal {
  const nombre = texto(b.nombre, 100);
  if (!nombre) throw new HttpError(400, "El nombre de la sucursal es obligatorio");
  const estado = texto(b.estado) ?? "activa";
  if (!["activa", "inactiva", "pausada"].includes(estado))
    throw new HttpError(400, "Estado inválido");
  const email = texto(b.email, 255);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new HttpError(400, "Email inválido");
  return {
    nombre,
    calle: texto(b.calle),
    ciudad: texto(b.ciudad, 100),
    estado_region: texto(b.estado_region, 100),
    codigo_postal: texto(b.codigo_postal, 20),
    telefono: texto(b.telefono, 30),
    email,
    encargado: texto(b.encargado, 100),
    timezone: texto(b.timezone, 60) ?? "America/Mexico_City",
    estado,
  };
}

async function guardarSucursal(ctx: Ctx, b: Body) {
  const s = leerSucursal(b);
  if (typeof b.id === "string") {
    const actual = await sucursalDelComercio(ctx, b.id);
    if (actual.id_externo) {
      await ctx.ecart.request("PUT", `/api/pos/branches/${actual.id_externo}`, {
        body: sucursalAEcart(s, actual.id),
      });
    }
    const { error } = await ctx.sb
      .from("sucursales")
      .update({ ...s, sincronizado_at: ahora(), updated_at: ahora() })
      .eq("id", actual.id);
    if (error) throw new HttpError(500, error.message);
    return { id: actual.id };
  }
  const idLocal = crypto.randomUUID();
  const r = await ctx.ecart.post("/api/pos/branches", sucursalAEcart(s, idLocal));
  const { error } = await ctx.sb.from("sucursales").insert({
    id: idLocal,
    comercio_id: ctx.comercioId,
    id_externo: idCreado(r),
    ...s,
    sincronizado_at: ahora(),
  });
  if (error) throw new HttpError(500, error.message);
  return { id: idLocal };
}

async function borrarSucursal(ctx: Ctx, b: Body) {
  const actual = await sucursalDelComercio(ctx, b.id);
  if (actual.id_externo)
    await ctx.ecart.request("DELETE", `/api/pos/branches/${actual.id_externo}`);
  const { error } = await ctx.sb
    .from("sucursales")
    .update({ eliminado_at: ahora(), updated_at: ahora() })
    .eq("id", actual.id);
  if (error) throw new HttpError(500, error.message);
  await ctx.sb
    .from("cajas")
    .update({ eliminado_at: ahora(), terminal_id: null })
    .eq("sucursal_id", actual.id)
    .is("eliminado_at", null);
  return { ok: true };
}

function leerCaja(b: Body): CajaLocal {
  const nombre = texto(b.nombre, 100);
  const numero = texto(b.numero, 50);
  if (!nombre || !numero) throw new HttpError(400, "Nombre y número de caja son obligatorios");
  const estado = texto(b.estado) ?? "activa";
  if (!["activa", "inactiva", "mantenimiento"].includes(estado)) {
    throw new HttpError(400, "Estado inválido");
  }
  const num = (v: unknown) => (typeof v === "number" && v >= 0 ? Math.round(v * 100) / 100 : null);
  const copias = typeof b.copias_ticket === "number" ? Math.trunc(b.copias_ticket) : 1;
  if (copias < 1 || copias > 5) throw new HttpError(400, "Las copias de ticket van de 1 a 5");
  return {
    nombre,
    numero,
    estado,
    permite_reembolsos: b.permite_reembolsos === true,
    tope_reembolso: num(b.tope_reembolso),
    requiere_aprobacion: b.requiere_aprobacion === true,
    umbral_aprobacion: num(b.umbral_aprobacion),
    copias_ticket: copias,
  };
}

async function guardarCaja(ctx: Ctx, b: Body) {
  const c = leerCaja(b);
  if (typeof b.id === "string") {
    const actual = await cajaDelComercio(ctx, b.id);
    if (actual.id_externo && actual.sucursalExterna) {
      await ctx.ecart.request("PUT", `/api/pos/sales-registers/${actual.id_externo}`, {
        body: cajaAEcart(c, actual.sucursalExterna, actual.id),
      });
    }
    const { error } = await ctx.sb
      .from("cajas")
      .update({ ...c, sincronizado_at: ahora(), updated_at: ahora() })
      .eq("id", actual.id);
    if (error)
      throw new HttpError(
        error.code === "23505" ? 409 : 500,
        error.code === "23505" ? "Ya hay una caja con ese número en la sucursal" : error.message,
      );
    return { id: actual.id };
  }
  const suc = await sucursalDelComercio(ctx, b.sucursal_id);
  if (!suc.id_externo) throw new HttpError(409, "La sucursal no está sincronizada con Ecart Pay");
  const idLocal = crypto.randomUUID();
  const r = await ctx.ecart.post(
    "/api/pos/sales-registers",
    cajaAEcart(c, suc.id_externo, idLocal),
  );
  const { error } = await ctx.sb.from("cajas").insert({
    id: idLocal,
    sucursal_id: suc.id,
    id_externo: idCreado(r),
    ...c,
    sincronizado_at: ahora(),
  });
  if (error) throw new HttpError(500, error.message);
  return { id: idLocal };
}

async function borrarCaja(ctx: Ctx, b: Body) {
  const actual = await cajaDelComercio(ctx, b.id);
  if (actual.id_externo) {
    await ctx.ecart.request("DELETE", `/api/pos/sales-registers/${actual.id_externo}`);
  }
  const { error } = await ctx.sb
    .from("cajas")
    .update({ eliminado_at: ahora(), terminal_id: null, updated_at: ahora() })
    .eq("id", actual.id);
  if (error) throw new HttpError(500, error.message);
  return { ok: true };
}

async function vincularTerminal(ctx: Ctx, b: Body, vincular: boolean) {
  const caja = await cajaDelComercio(ctx, b.caja_id);
  if (!caja.id_externo) throw new HttpError(409, "La caja no está sincronizada con Ecart Pay");
  const terminalId = vincular ? b.terminal_id : caja.terminal_id;
  if (typeof terminalId !== "string") throw new HttpError(400, "Falta la terminal");
  const { data: t } = await ctx.sb
    .from("terminales")
    .select("id, id_externo, comercio_id")
    .eq("id", terminalId)
    .maybeSingle();
  if (!t || t.comercio_id !== ctx.comercioId) throw new HttpError(404, "Terminal inexistente");
  await ctx.ecart.request(
    "PUT",
    `/api/pos/sales-registers/${caja.id_externo}/${vincular ? "link" : "unlink"}-terminal`,
    { body: { pos_information_id: t.id_externo } },
  );
  if (vincular) {
    // Una terminal por caja: se suelta de cualquier otra caja antes de asignarla.
    await ctx.sb.from("cajas").update({ terminal_id: null }).eq("terminal_id", t.id);
  }
  const { error } = await ctx.sb
    .from("cajas")
    .update({ terminal_id: vincular ? t.id : null, updated_at: ahora() })
    .eq("id", caja.id);
  if (error) throw new HttpError(500, error.message);
  return { ok: true };
}

async function modoTerminal(ctx: Ctx, b: Body) {
  if (typeof b.terminal_id !== "string") throw new HttpError(400, "Falta la terminal");
  const { data: t } = await ctx.sb
    .from("terminales")
    .select("id, id_externo, comercio_id")
    .eq("id", b.terminal_id)
    .maybeSingle();
  if (!t || t.comercio_id !== ctx.comercioId) throw new HttpError(404, "Terminal inexistente");
  const activar = b.punto_venta === true;
  await ctx.ecart.request(
    "PUT",
    `/api/pos/terminals/${t.id_externo}/${activar ? "enable" : "disable"}-pos`,
  );
  const { error } = await ctx.sb
    .from("terminales")
    .update({
      es_punto_venta: activar,
      modo: activar ? "POINT_OF_SALE" : null,
      updated_at: ahora(),
    })
    .eq("id", t.id);
  if (error) throw new HttpError(500, error.message);
  return { ok: true };
}

/** Trae sucursales, cajas y terminales de Ecart Pay (lo creado desde su panel) y las alinea. */
async function sincronizar(ctx: Ctx) {
  const { sb, ecart, comercioId } = ctx;
  const [branches, registers, terminals] = await Promise.all([
    listarTodo(ecart, "/api/pos/branches"),
    listarTodo(ecart, "/api/pos/sales-registers"),
    listarTodo(ecart, "/api/pos/terminals/point-of-sale", { status: "active" }),
  ]);

  const sucursales = branches.map(sucursalDeEcart).filter((s) => s.id_externo);
  if (sucursales.length) {
    const { error } = await sb.from("sucursales").upsert(
      sucursales.map((s) => ({
        ...s,
        comercio_id: comercioId,
        proveedor: "ecartpay",
        eliminado_at: null,
        sincronizado_at: ahora(),
        updated_at: ahora(),
      })),
      { onConflict: "proveedor,id_externo" },
    );
    if (error) throw new HttpError(500, error.message);
  }
  // Lo que ya no existe en Ecart Pay queda dado de baja.
  const externosSuc = sucursales.map((s) => s.id_externo);
  let bajaSuc = sb
    .from("sucursales")
    .update({ eliminado_at: ahora() })
    .eq("comercio_id", comercioId)
    .is("eliminado_at", null)
    .not("id_externo", "is", null);
  if (externosSuc.length) bajaSuc = bajaSuc.not("id_externo", "in", `(${externosSuc.join(",")})`);
  await bajaSuc;

  const { data: locales } = await sb
    .from("sucursales")
    .select("id, id_externo")
    .eq("comercio_id", comercioId);
  const sucPorExterno = new Map((locales ?? []).map((s) => [s.id_externo, s.id]));

  const terms = terminals.map(terminalDeEcart).filter((t) => t.id_externo);
  if (terms.length) {
    const { error } = await sb.from("terminales").upsert(
      terms.map(({ caja_externa: _c, ...t }) => ({
        ...t,
        comercio_id: comercioId,
        proveedor: "ecartpay",
        sincronizado_at: ahora(),
        updated_at: ahora(),
      })),
      { onConflict: "proveedor,id_externo" },
    );
    if (error) throw new HttpError(500, error.message);
  }
  const { data: termLocales } = await sb
    .from("terminales")
    .select("id, id_externo")
    .eq("comercio_id", comercioId);
  const termPorExterno = new Map((termLocales ?? []).map((t) => [t.id_externo, t.id]));
  const cajaDeTerminal = new Map(
    terms.filter((t) => t.caja_externa).map((t) => [t.caja_externa as string, t.id_externo]),
  );

  const cajas = registers
    .map(cajaDeEcart)
    .filter((c) => c.id_externo && c.sucursal_externa && sucPorExterno.has(c.sucursal_externa));
  // Se sueltan las terminales para reasignarlas según Ecart Pay (una por caja).
  await sb
    .from("cajas")
    .update({ terminal_id: null })
    .in("sucursal_id", [...sucPorExterno.values()]);
  for (const c of cajas) {
    const { sucursal_externa, terminal_externa, ...campos } = c;
    const terminalExterna = terminal_externa ?? cajaDeTerminal.get(c.id_externo) ?? null;
    const { error } = await sb.from("cajas").upsert(
      {
        ...campos,
        sucursal_id: sucPorExterno.get(sucursal_externa as string),
        terminal_id: terminalExterna ? (termPorExterno.get(terminalExterna) ?? null) : null,
        eliminado_at: null,
        sincronizado_at: ahora(),
        updated_at: ahora(),
      },
      { onConflict: "id_externo" },
    );
    if (error) throw new HttpError(500, error.message);
  }
  const externosCaja = cajas.map((c) => c.id_externo);
  let bajaCaja = sb
    .from("cajas")
    .update({ eliminado_at: ahora() })
    .in("sucursal_id", [...sucPorExterno.values()])
    .is("eliminado_at", null)
    .not("id_externo", "is", null);
  if (externosCaja.length)
    bajaCaja = bajaCaja.not("id_externo", "in", `(${externosCaja.join(",")})`);
  await bajaCaja;

  return { sucursales: sucursales.length, cajas: cajas.length, terminales: terms.length };
}
