// Edge Function: cuentas y CLABEs en Cobre (Fase C2). Body: { accion, ... }.
//
// - `cuenta_plataforma` (solo admin): crea el Cobre Balance MX de JPay (modelo centralizado) y
//   lo deja en `cobre_configuracion.cuenta_plataforma_id`. Si ya existe, lo devuelve.
// - `asignar_clabe` { subcuenta_id } (cliente dueño o admin): da a la subcuenta una CLABE virtual
//   sobre el Balance que le toca según su modelo de fondos (`centralizado` → el de JPay;
//   `por_comercio` → el propio del cliente, que se crea la primera vez). La CLABE queda en
//   `cobre_clabes` y en `subaccounts.cbu`. Si ya tiene una activa, la devuelve.
// - `devolver_deposito` { deposito_id } (solo admin): devuelve al remitente un depósito que
//   llegó a una CLABE sin dueño (`/money_movements_return`). Uno ya acreditado no se devuelve
//   por acá: se ajusta desde el backoffice. El resultado llega por aviso o por la revisión de
//   pendientes.
// - `deshabilitar_clabe` { clabe_id } (solo admin): la da de baja en Cobre (los depósitos a esa
//   CLABE se rechazan) y en JPay.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { CobreError, type ModoCobre } from "../_shared/cobre.ts";
import { conexionCobre } from "../_shared/cobre-servidor.ts";
import type { CobreCliente } from "../_shared/cobre.ts";
import {
  esAdmin,
  handler,
  HttpError,
  json,
  readJson,
  serviceClient,
  userClient,
} from "../_shared/http.ts";

type Body = { accion?: unknown; subcuenta_id?: unknown; clabe_id?: unknown; deposito_id?: unknown };
type Ctx = { sb: SupabaseClient; cobre: CobreCliente; modo: ModoCobre };
type CuentaCobre = { id: string; cuenta_externa_id: string; clabe: string | null };

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    const admin = await esAdmin(req);
    const { cliente: cobre, modo } = conexionCobre(sb);
    const ctx: Ctx = { sb, cobre, modo };

    try {
      switch (body.accion) {
        case "cuenta_plataforma":
          if (!admin) throw new HttpError(403, "Solo para administradores");
          return json(await cuentaPlataforma(ctx));
        case "asignar_clabe": {
          if (typeof body.subcuenta_id !== "string") throw new HttpError(400, "Falta la subcuenta");
          const legajo = admin ? null : await legajoDeSesion(req);
          return json(await asignarClabe(ctx, body.subcuenta_id, legajo));
        }
        case "devolver_deposito":
          if (!admin) throw new HttpError(403, "Solo para administradores");
          if (typeof body.deposito_id !== "string") throw new HttpError(400, "Falta el depósito");
          return json(await devolverDeposito(ctx, body.deposito_id));
        case "deshabilitar_clabe":
          if (!admin) throw new HttpError(403, "Solo para administradores");
          if (typeof body.clabe_id !== "string") throw new HttpError(400, "Falta la CLABE");
          return json(await deshabilitarClabe(ctx, body.clabe_id));
        default:
          throw new HttpError(400, "Acción inválida");
      }
    } catch (e) {
      if (e instanceof CobreError) {
        throw new HttpError(e.status >= 400 && e.status < 500 ? 422 : 502, `Cobre: ${e.message}`);
      }
      throw e;
    }
  }),
);

async function legajoDeSesion(req: Request): Promise<string> {
  const { data, error } = await userClient(req).rpc("current_cliente_legajo");
  if (error || typeof data !== "string" || !data) throw new HttpError(403, "Cliente no encontrado");
  return data;
}

type CuentaCreada = { id: string; account_number?: string };

async function crearBalance(ctx: Ctx, alias: string): Promise<CuentaCreada> {
  return await ctx.cobre.post<CuentaCreada>("/accounts", {
    provider_id: "pr_mex_cobre3",
    action: "create",
    alias: alias.slice(0, 32),
  });
}

async function cuentaPlataforma(ctx: Ctx): Promise<CuentaCobre> {
  const { data: conf, error } = await ctx.sb
    .from("cobre_configuracion")
    .select("cuenta_plataforma_id, cobre_cuentas(id, cuenta_externa_id, clabe, modo, estado)")
    .eq("id", 1)
    .single();
  if (error) throw new HttpError(500, error.message);
  const actual = conf.cobre_cuentas as unknown as
    (CuentaCobre & { modo: string; estado: string }) | null;
  if (actual && actual.modo === ctx.modo && actual.estado === "activa") return actual;

  const c = await crearBalance(ctx, "JPay MX");
  const { data: fila, error: e2 } = await ctx.sb
    .from("cobre_cuentas")
    .insert({
      tipo: "plataforma",
      modo: ctx.modo,
      cuenta_externa_id: c.id,
      clabe: c.account_number ?? null,
      alias: "JPay MX",
    })
    .select("id, cuenta_externa_id, clabe")
    .single();
  if (e2) throw new HttpError(500, e2.message);
  const { error: e3 } = await ctx.sb
    .from("cobre_configuracion")
    .update({ cuenta_plataforma_id: fila.id, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (e3) throw new HttpError(500, e3.message);
  return fila;
}

/** Balance donde vive la CLABE del cliente, según su modelo de fondos. */
async function cuentaDelCliente(ctx: Ctx, legajo: string): Promise<CuentaCobre> {
  const [{ data: modeloCliente }, { data: conf }] = await Promise.all([
    ctx.sb
      .from("cobre_clientes")
      .select("modelo_fondos")
      .eq("cliente_legajo", legajo)
      .maybeSingle(),
    ctx.sb.from("cobre_configuracion").select("modelo_default").eq("id", 1).single(),
  ]);
  const modelo = modeloCliente?.modelo_fondos ?? conf?.modelo_default ?? "centralizado";
  if (modelo === "centralizado") {
    const { data } = await ctx.sb
      .from("cobre_configuracion")
      .select("cobre_cuentas(id, cuenta_externa_id, clabe, modo, estado)")
      .eq("id", 1)
      .single();
    const c = data?.cobre_cuentas as unknown as
      (CuentaCobre & { modo: string; estado: string }) | null;
    if (!c || c.modo !== ctx.modo || c.estado !== "activa") {
      throw new HttpError(
        409,
        "Falta crear la cuenta de JPay en Cobre (admin > País y proveedores)",
      );
    }
    return c;
  }
  const { data: propia } = await ctx.sb
    .from("cobre_cuentas")
    .select("id, cuenta_externa_id, clabe")
    .eq("tipo", "cliente")
    .eq("cliente_legajo", legajo)
    .eq("modo", ctx.modo)
    .eq("estado", "activa")
    .maybeSingle();
  if (propia) return propia;
  const c = await crearBalance(ctx, legajo);
  const { data: fila, error } = await ctx.sb
    .from("cobre_cuentas")
    .insert({
      tipo: "cliente",
      cliente_legajo: legajo,
      modo: ctx.modo,
      cuenta_externa_id: c.id,
      clabe: c.account_number ?? null,
      alias: legajo,
    })
    .select("id, cuenta_externa_id, clabe")
    .single();
  if (error) throw new HttpError(500, error.message);
  return fila;
}

async function asignarClabe(ctx: Ctx, subcuentaId: string, legajoSesion: string | null) {
  const { data: sub, error } = await ctx.sb
    .from("subaccounts")
    .select("id, cliente_legajo, nombre, estado")
    .eq("id", subcuentaId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!sub || (legajoSesion && sub.cliente_legajo !== legajoSesion)) {
    throw new HttpError(404, "Subcuenta inexistente");
  }

  const { data: existente } = await ctx.sb
    .from("cobre_clabes")
    .select("id, clabe, estado, created_at")
    .eq("subcuenta_id", subcuentaId)
    .eq("modo", ctx.modo)
    .eq("estado", "activa")
    .maybeSingle();
  if (existente) return existente;

  const [{ data: cli }, { data: moneda }] = await Promise.all([
    ctx.sb.from("clientes").select("pais").eq("legajo", sub.cliente_legajo).maybeSingle(),
    ctx.sb
      .from("ledger_accounts")
      .select("currency_code")
      .eq("subaccount_id", subcuentaId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (cli?.pais !== "MX" || moneda?.currency_code !== "MXN") {
    throw new HttpError(
      409,
      "Solo las subcuentas de clientes de México (en MXN) tienen CLABE de Cobre",
    );
  }

  const cuenta = await cuentaDelCliente(ctx, sub.cliente_legajo);
  const alias = `${sub.cliente_legajo} ${sub.nombre ?? ""}`.trim();
  const ref = await ctx.cobre.post<{ id: string; value: string }>("/account_references", {
    source_id: cuenta.cuenta_externa_id,
    type: "virtual_clabe_accounts",
    alias: alias.slice(0, 32),
  });
  if (!/^\d{18}$/.test(ref?.value ?? "")) {
    throw new HttpError(502, "Cobre no devolvió una CLABE válida");
  }
  const { data: fila, error: e2 } = await ctx.sb
    .from("cobre_clabes")
    .insert({
      subcuenta_id: subcuentaId,
      cliente_legajo: sub.cliente_legajo,
      cuenta_id: cuenta.id,
      modo: ctx.modo,
      clabe: ref.value,
      referencia_externa_id: ref.id,
    })
    .select("id, clabe, estado, created_at")
    .single();
  if (e2) throw new HttpError(500, e2.message);
  const { error: e3 } = await ctx.sb
    .from("subaccounts")
    .update({ cbu: ref.value })
    .eq("id", subcuentaId);
  if (e3) throw new HttpError(500, e3.message);
  return fila;
}

async function deshabilitarClabe(ctx: Ctx, clabeId: string) {
  const { data: c, error } = await ctx.sb
    .from("cobre_clabes")
    .select("id, subcuenta_id, clabe, referencia_externa_id, estado, modo")
    .eq("id", clabeId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!c) throw new HttpError(404, "CLABE inexistente");
  if (c.estado === "deshabilitada") return c;
  if (c.modo !== ctx.modo) throw new HttpError(409, `La CLABE es del modo ${c.modo}`);
  if (c.referencia_externa_id)
    await ctx.cobre.delete(`/account_references/${c.referencia_externa_id}`);
  const { data: fila, error: e2 } = await ctx.sb
    .from("cobre_clabes")
    .update({ estado: "deshabilitada", deshabilitada_at: new Date().toISOString() })
    .eq("id", clabeId)
    .select("id, subcuenta_id, clabe, estado")
    .single();
  if (e2) throw new HttpError(500, e2.message);
  await ctx.sb
    .from("subaccounts")
    .update({ cbu: null })
    .eq("id", c.subcuenta_id)
    .eq("cbu", c.clabe);
  return fila;
}

async function devolverDeposito(ctx: Ctx, depositoId: string) {
  const { data: d, error } = await ctx.sb
    .from("cobre_depositos")
    .select("id, modo, estado, transaccion_externa_id, devolucion_estado")
    .eq("id", depositoId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!d) throw new HttpError(404, "Depósito inexistente");
  if (d.modo !== ctx.modo) throw new HttpError(409, `El depósito es del modo ${d.modo}`);
  if (d.estado !== "sin_asignar") {
    throw new HttpError(
      409,
      "Solo se devuelven depósitos sin asignar; uno acreditado se ajusta desde el backoffice",
    );
  }
  if (d.devolucion_estado && !["rechazada", "fallida", "cancelada"].includes(d.devolucion_estado)) {
    throw new HttpError(409, "La devolución ya está en curso");
  }
  const mm = await ctx.cobre.post<{ id: string; status?: { state?: string } }>(
    "/money_movements_return",
    {
      transaction_id: d.transaccion_externa_id,
      metadata: { description: "Devolucion: CLABE sin titular en JPay" },
    },
  );
  const { data: fila, error: e2 } = await ctx.sb
    .from("cobre_depositos")
    .update({ devolucion_mm_id: mm.id, devolucion_estado: "pendiente", devolucion_motivo: null })
    .eq("id", d.id)
    .select("id, estado, devolucion_estado, devolucion_mm_id")
    .single();
  if (e2) throw new HttpError(500, e2.message);
  return fila;
}
