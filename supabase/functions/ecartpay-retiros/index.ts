// Edge Function: retiros del comercio en Ecart Pay (Fase 6) y alta de cuentas de retiro.
// Ecart Pay no documenta crear retiros por API: el comercio los pide desde su panel. Acá se
// muestran el saldo (`/api/transactions/summary`), las cuentas de retiro (con el número
// enmascarado, `/api/payment-methods`) y el historial (`/api/withdrawals`, paginado).
// La usa el comercio dueño o un admin (con `comercio_id`). Body: { comercio_id?, pagina?, estado? }.
//
// Cuenta de retiro (docs: /docs/payment-methods), con `accion`:
//  - "preparar_cuenta": la CLABE de Cobre del cliente, su banco (TESORED) según `/api/banks`, el
//    titular y el RFC, para llenar el formulario.
//  - "enviar_codigo": Ecart Pay manda un código de un solo uso al correo del dueño de la cuenta
//    (`POST /api/otp/send`, permiso `write_otp`).
//  - "crear_cuenta": `POST /api/payment-methods` con ese código. Solo se acepta una CLABE de Cobre
//    activa del cliente (lo cobrado con tarjeta se retira a su Balance de Cobre). Con el RFC,
//    Ecart Pay valida la CLABE con STP; el estado se ve en la lista de cuentas.

import {
  clienteDeConexion,
  comercioDeLaSolicitud,
  conexionEcartPay,
} from "../_shared/conexiones.ts";
import {
  bancoDeClabe,
  clabeRegistrada,
  cuentaRetiroDeEcart,
  EcartPayError,
  esRfc,
  retiroDeEcart,
} from "../_shared/ecartpay.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";
import { brand } from "../_shared/brand.ts";
import { modoCobre } from "../_shared/cobre.ts";

type Body = {
  comercio_id?: unknown;
  pagina?: unknown;
  estado?: unknown;
  accion?: unknown;
  clabe?: unknown;
  alias?: unknown;
  titular?: unknown;
  rfc?: unknown;
  codigo?: unknown;
};
type Obj = Record<string, unknown>;

const POR_PAGINA = 20;
const ESTADOS = ["processing", "paid", "pending", "failed", "canceled", "rejected"];

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    const comercioId = await comercioDeLaSolicitud(req, sb, body.comercio_id);
    const conexion = await conexionEcartPay(sb, [comercioId]);
    if (!conexion)
      throw new HttpError(409, "El comercio no tiene activados los cobros con tarjeta");
    const ecart = await clienteDeConexion(sb, conexion);

    if (
      body.accion === "preparar_cuenta" ||
      body.accion === "enviar_codigo" ||
      body.accion === "crear_cuenta"
    ) {
      try {
        return json(await cuentaDeRetiro(sb, ecart, comercioId, body));
      } catch (e) {
        if (e instanceof EcartPayError) throw new HttpError(502, mensajeEcart(e));
        throw e;
      }
    }
    const { data: pais } = await sb
      .from("paises")
      .select("moneda")
      .eq("predeterminado", true)
      .maybeSingle();
    const moneda = pais?.moneda ?? "MXN";

    const pagina =
      typeof body.pagina === "number" && Number.isInteger(body.pagina) && body.pagina > 0
        ? Math.min(body.pagina, 500)
        : 1;
    const estado =
      typeof body.estado === "string" && ESTADOS.includes(body.estado) ? body.estado : undefined;

    try {
      // Si alguna de las tres falla, se informa por separado: el resto sigue siendo útil.
      const [historial, cuentas, resumen] = await Promise.allSettled([
        ecart.get<{ docs?: unknown; pages?: unknown; count?: unknown }>("/api/withdrawals", {
          page: pagina,
          limit: POR_PAGINA,
          status: estado,
        }),
        ecart.get<unknown>("/api/payment-methods", { limit: 50 }),
        ecart.get<Obj>("/api/transactions/summary", { currency: moneda }),
      ]);

      const docs = historial.status === "fulfilled" ? historial.value : null;
      const lista = Array.isArray(docs?.docs) ? (docs.docs as Obj[]) : [];
      // `/api/payment-methods` responde paginado (`docs`); la ruta vieja, un arreglo o `data`.
      const c = cuentas.status === "fulfilled" ? (cuentas.value as Obj | unknown[] | null) : null;
      const listaCuentas = (Array.isArray(c) ? c : (c?.docs ?? c?.data ?? [])) as Obj[];

      return json({
        retiros: lista.map(retiroDeEcart),
        pagina,
        paginas: typeof docs?.pages === "number" ? docs.pages : 1,
        total: typeof docs?.count === "number" ? docs.count : lista.length,
        cuentas: Array.isArray(listaCuentas) ? listaCuentas.map(cuentaRetiroDeEcart) : [],
        saldo: resumen.status === "fulfilled" ? saldo(resumen.value, moneda) : null,
        errores: [
          historial.status === "rejected" ? `historial: ${motivo(historial.reason)}` : null,
          cuentas.status === "rejected" ? `cuentas: ${motivo(cuentas.reason)}` : null,
          resumen.status === "rejected" ? `saldo: ${motivo(resumen.reason)}` : null,
        ].filter(Boolean),
      });
    } catch (e) {
      if (e instanceof EcartPayError)
        throw new HttpError(502, `No se pudo completar la operación: ${e.message}`);
      throw e;
    }
  }),
);

const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Saldo en la moneda del país: cobrado, cargos (retiros, reembolsos, comisiones) y disponible. */
function saldo(r: Obj, moneda: string) {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const balances = Array.isArray(r?.balances) ? (r.balances as Obj[]) : [];
  const b = balances.find((x) => x.currency === moneda);
  return {
    moneda,
    cobrado: n(b?.payments) ?? 0,
    cargos: n(b?.charges) ?? 0,
    disponible: n(b?.amount) ?? (r?.currency === moneda ? n(r?.total) : null) ?? 0,
  };
}

type ClienteEcart = Awaited<ReturnType<typeof clienteDeConexion>>;

/** CLABEs de Cobre activas del cliente dueño del comercio, y sus datos para el formulario. */
async function datosDelCliente(sb: SupabaseClient, comercioId: string) {
  const { data: comercio, error } = await sb
    .from("comercios")
    .select("legajo")
    .eq("id", comercioId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!comercio?.legajo) throw new HttpError(404, "Comercio no encontrado");
  const [{ data: cliente }, { data: clabes, error: e2 }] = await Promise.all([
    sb
      .from("clientes")
      .select("nombre_legal, nombre, cuit, tax_id")
      .eq("legajo", comercio.legajo)
      .maybeSingle(),
    sb
      .from("cobre_clabes")
      .select("clabe, subaccounts(nombre)")
      .eq("cliente_legajo", comercio.legajo)
      .eq("estado", "activa")
      // Solo las del modo actual: las del simulador no son CLABEs reales.
      .eq("modo", modoCobre())
      .order("created_at"),
  ]);
  if (e2) throw new HttpError(500, e2.message);
  const rfc = [cliente?.tax_id, cliente?.cuit].find(esRfc);
  return {
    titular: cliente?.nombre_legal ?? cliente?.nombre ?? null,
    rfc: rfc ? rfc.toUpperCase() : null,
    clabes: (clabes ?? [])
      .filter((c) => typeof c.clabe === "string" && /^\d{18}$/.test(c.clabe))
      .map((c) => ({
        clabe: c.clabe as string,
        subcuenta: (c.subaccounts as { nombre?: string } | null)?.nombre ?? null,
      })),
  };
}

async function cuentaDeRetiro(
  sb: SupabaseClient,
  ecart: ClienteEcart,
  comercioId: string,
  b: Body,
) {
  if (b.accion === "enviar_codigo") {
    await ecart.post("/api/otp/send", { type: "email", resource: "payment_methods" });
    return { enviado: true };
  }

  const datos = await datosDelCliente(sb, comercioId);
  const bancos = await ecart.get<unknown>("/api/banks", { country: "MX" });

  if (b.accion === "preparar_cuenta") {
    const registradas = await ecart.get<unknown>("/api/payment-methods", { limit: 50 });
    return {
      titular: datos.titular,
      rfc: datos.rfc,
      // Vinculada: alguna CLABE de Cobre del cliente ya es cuenta de retiro en Ecart Pay.
      vinculada: datos.clabes.some((c) => clabeRegistrada(registradas, c.clabe)),
      clabes: datos.clabes.map((c) => ({ ...c, banco: bancoDeClabe(bancos, c.clabe) })),
    };
  }

  // crear_cuenta: sin CLABE/RFC/titular explícitos se usan los del cliente.
  const clabe =
    typeof b.clabe === "string" && b.clabe.trim()
      ? b.clabe.replace(/\s/g, "")
      : (datos.clabes[0]?.clabe ?? "");
  if (!datos.clabes.some((c) => c.clabe === clabe))
    throw new HttpError(
      400,
      `La cuenta de retiro tiene que ser una CLABE de tu cuenta ${brand.name}`,
    );
  const banco = bancoDeClabe(bancos, clabe);
  if (!banco) throw new HttpError(409, "El procesador de pagos no reconoce el banco de esa CLABE");
  const rfc =
    typeof b.rfc === "string" && b.rfc.trim() ? b.rfc.trim().toUpperCase() : (datos.rfc ?? "");
  if (!esRfc(rfc)) throw new HttpError(400, "El RFC no es válido (12 o 13 caracteres)");
  const codigo = typeof b.codigo === "string" ? b.codigo.trim() : "";
  if (!/^\d{4,8}$/.test(codigo))
    throw new HttpError(400, "Escribe el código que te llegó por correo");
  const texto = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const titular = texto(b.titular, 120) ?? datos.titular;
  if (!titular) throw new HttpError(400, "Falta el nombre del titular");

  const creada = await ecart.post<Record<string, unknown>>("/api/payment-methods", {
    method: "clabe",
    name: texto(b.alias, 60) ?? `Cuenta ${brand.name}`,
    number: clabe,
    business_name: titular,
    bank: banco.clave,
    country: "MX",
    rfc,
    otp: codigo,
  });
  return { cuenta: cuentaRetiroDeEcart(creada ?? {}) };
}

/** Mensaje claro para los errores más comunes de Ecart Pay al crear la cuenta. */
function mensajeEcart(e: EcartPayError): string {
  if (e.status === 403)
    return "Falta el permiso para crear cuentas de retiro: vuelve a activar los cobros con tarjeta en Conexiones";
  return `No se pudo completar la operación: ${e.message}`;
}
