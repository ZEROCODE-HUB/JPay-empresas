// Edge Function: Cobre Balances (Solution Design §3.1 y §4.1). Body: { accion, ... }.
//
// Modelo: cada comercio tiene su Cobre Balance México, creado al aprobarse su Subcliente
// (`cobre-subclientes`); su CLABE llega a la subcuenta receptora. No hay balance concentrador
// (el modelo `centralizado` y las CLABEs virtuales de C2 quedaron sin uso).
//
// - `balances_matriz` (solo admin): crea, si faltan, los Balances Global USD (`pr_global_cobre`,
//   destino de las conversiones) y USA (`pr_usa_cobre`, origen de Fedwire y SWIFT) de JPay.
// - `consultar_balance` { cuenta_id } (solo admin): `GET /accounts/{id}`; guarda la
//   conectividad (no se opera hasta `connected`) y devuelve el saldo en Cobre.
// - `receptora` { subcuenta_id } (comercio dueño o admin): mueve la CLABE del Balance del comercio
//   a otra de sus subcuentas en pesos.
// - `devolver_deposito` { deposito_id } (solo admin): devuelve al remitente un depósito que no se
//   pudo asignar (`/money_movements_return`). Uno ya acreditado se ajusta desde el backoffice.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { CobreError, deCentavos } from "../_shared/cobre.ts";
import { conexionCobre, type ConexionCobre } from "../_shared/cobre-servidor.ts";
import { asignarClabeReceptora } from "../_shared/cobre-subclientes.ts";
import {
  esAdmin,
  handler,
  HttpError,
  json,
  readJson,
  serviceClient,
  userClient,
} from "../_shared/http.ts";

type Body = {
  accion?: unknown;
  subcuenta_id?: unknown;
  cuenta_id?: unknown;
  deposito_id?: unknown;
};
type Ctx = { sb: SupabaseClient; conexion: ConexionCobre };

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    const admin = await esAdmin(req);
    const ctx: Ctx = { sb, conexion: conexionCobre(sb) };
    const soloAdmin = () => {
      if (!admin) throw new HttpError(403, "Solo para administradores");
    };

    try {
      switch (body.accion) {
        case "balances_matriz":
          soloAdmin();
          return json(await balancesMatriz(ctx));
        case "consultar_balance":
          soloAdmin();
          if (typeof body.cuenta_id !== "string") throw new HttpError(400, "Falta la cuenta");
          return json(await consultarBalance(ctx, body.cuenta_id));
        case "receptora": {
          if (typeof body.subcuenta_id !== "string") throw new HttpError(400, "Falta la subcuenta");
          const legajo = admin ? null : await legajoDeSesion(req);
          return json(await cambiarReceptora(ctx, body.subcuenta_id, legajo));
        }
        case "devolver_deposito":
          soloAdmin();
          if (typeof body.deposito_id !== "string") throw new HttpError(400, "Falta el depósito");
          return json(await devolverDeposito(ctx, body.deposito_id));
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

type CuentaCreada = {
  id: string;
  account_number?: string | null;
  connectivity?: { status?: string };
};

async function balancesMatriz(ctx: Ctx) {
  const { sb, conexion } = ctx;
  const { data: actuales } = await sb
    .from("cobre_cuentas")
    .select("id, tipo, cuenta_externa_id, conectividad")
    .eq("modo", conexion.modo)
    .in("tipo", ["global", "usa"])
    .eq("estado", "activa");
  const filas = (actuales ?? []) as {
    id: string;
    tipo: string;
    cuenta_externa_id: string;
    conectividad: string | null;
  }[];
  const crear = async (tipo: "global" | "usa") => {
    const hay = filas.find((f) => f.tipo === tipo);
    if (hay) return hay;
    const c = await conexion.cliente.post<CuentaCreada>(
      "/accounts",
      tipo === "global"
        ? {
            provider_id: "pr_global_cobre",
            action: "create",
            metadata: { currency: "usd" },
            tags: ["jpay"],
            alias: "JPAY Global USD",
          }
        : {
            provider_id: "pr_usa_cobre",
            action: "create",
            metadata: {},
            tags: ["jpay"],
            alias: "JPAY USA",
          },
    );
    const { data, error } = await sb
      .from("cobre_cuentas")
      .insert({
        tipo,
        modo: conexion.modo,
        cuenta_externa_id: c.id,
        clabe: null,
        alias: tipo === "global" ? "JPAY Global USD" : "JPAY USA",
        proveedor_id: tipo === "global" ? "pr_global_cobre" : "pr_usa_cobre",
        moneda: "USD",
        conectividad: c.connectivity?.status ?? null,
      })
      .select("id, tipo, cuenta_externa_id, conectividad")
      .single();
    if (error)
      throw new HttpError(
        500,
        `Balance ${c.id} creado en Cobre pero no guardado: ${error.message}`,
      );
    await sb
      .from("cobre_configuracion")
      .update({
        [tipo === "global" ? "cuenta_global_id" : "cuenta_usa_id"]: data.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    return data;
  };
  return { global: await crear("global"), usa: await crear("usa") };
}

async function consultarBalance(ctx: Ctx, cuentaId: string) {
  const { data: c } = await ctx.sb
    .from("cobre_cuentas")
    .select("id, modo, cuenta_externa_id")
    .eq("id", cuentaId)
    .maybeSingle();
  if (!c) throw new HttpError(404, "Cuenta inexistente");
  if (c.modo !== ctx.conexion.modo) throw new HttpError(409, `La cuenta es del modo ${c.modo}`);
  const r = await ctx.conexion.cliente.get<{
    obtained_balance?: number;
    obtained_balance_at?: string;
    currency?: string;
    connectivity?: { status?: string };
    account_number?: string | null;
  }>(`/accounts/${c.cuenta_externa_id}`, { balance: true });
  await ctx.sb
    .from("cobre_cuentas")
    .update({ conectividad: r.connectivity?.status ?? null })
    .eq("id", c.id);
  return {
    id: c.id,
    conectividad: r.connectivity?.status ?? null,
    saldo: deCentavos(Number(r.obtained_balance ?? 0)),
    saldoAl: r.obtained_balance_at ?? null,
    moneda: (r.currency ?? "").toUpperCase() || null,
  };
}

async function cambiarReceptora(ctx: Ctx, subcuentaId: string, legajoSesion: string | null) {
  const { data: sub } = await ctx.sb
    .from("subaccounts")
    .select("id, cliente_legajo, estado, moneda")
    .eq("id", subcuentaId)
    .maybeSingle();
  if (!sub || (legajoSesion && sub.cliente_legajo !== legajoSesion)) {
    throw new HttpError(404, "Subcuenta inexistente");
  }
  if (sub.estado !== "Activa" || (sub.moneda && sub.moneda !== "MXN")) {
    throw new HttpError(409, "La CLABE solo puede ir a una subcuenta activa en pesos");
  }
  const { data: cuenta } = await ctx.sb
    .from("cobre_cuentas")
    .select("id, clabe")
    .eq("tipo", "cliente")
    .eq("cliente_legajo", sub.cliente_legajo)
    .eq("modo", ctx.conexion.modo)
    .eq("estado", "activa")
    .maybeSingle();
  if (!cuenta?.clabe) throw new HttpError(409, "El comercio todavía no tiene su cuenta en Cobre");
  await asignarClabeReceptora(
    ctx.sb,
    ctx.conexion.modo,
    cuenta.id,
    sub.id,
    sub.cliente_legajo,
    cuenta.clabe,
  );
  return { subcuenta_id: sub.id, clabe: cuenta.clabe };
}

async function devolverDeposito(ctx: Ctx, depositoId: string) {
  const { data: d, error } = await ctx.sb
    .from("cobre_depositos")
    .select("id, modo, estado, transaccion_externa_id, devolucion_estado")
    .eq("id", depositoId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!d) throw new HttpError(404, "Depósito inexistente");
  if (d.modo !== ctx.conexion.modo) throw new HttpError(409, `El depósito es del modo ${d.modo}`);
  if (d.estado !== "sin_asignar") {
    throw new HttpError(
      409,
      "Solo se devuelven depósitos sin asignar; uno acreditado se ajusta desde el backoffice",
    );
  }
  if (d.devolucion_estado && !["rechazada", "fallida", "cancelada"].includes(d.devolucion_estado)) {
    throw new HttpError(409, "La devolución ya está en curso");
  }
  const mm = await ctx.conexion.cliente.post<{ id: string }>("/money_movements_return", {
    transaction_id: d.transaccion_externa_id,
    metadata: { description: "Devolucion: deposito sin titular en JPay" },
  });
  const { data: fila, error: e2 } = await ctx.sb
    .from("cobre_depositos")
    .update({ devolucion_mm_id: mm.id, devolucion_estado: "pendiente", devolucion_motivo: null })
    .eq("id", d.id)
    .select("id, estado, devolucion_estado, devolucion_mm_id")
    .single();
  if (e2) throw new HttpError(500, e2.message);
  return fila;
}
