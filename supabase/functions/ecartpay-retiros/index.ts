// Edge Function: retiros del comercio en Ecart Pay (Fase 6). Solo consulta.
// Ecart Pay no documenta crear retiros por API: el comercio los pide desde su panel. Acá se
// muestran el saldo (`/api/transactions/summary`), las cuentas de retiro (con el número
// enmascarado, `/api/payment-methods`) y el historial (`/api/withdrawals`, paginado).
// La usa el comercio dueño o un admin (con `comercio_id`). Body: { comercio_id?, pagina?, estado? }.

import { clienteDeConexion, comercioDeSesion, conexionEcartPay } from "../_shared/conexiones.ts";
import { cuentaRetiroDeEcart, EcartPayError, retiroDeEcart } from "../_shared/ecartpay.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

type Body = { comercio_id?: unknown; pagina?: unknown; estado?: unknown };
type Obj = Record<string, unknown>;

const POR_PAGINA = 20;
const ESTADOS = ["processing", "paid", "pending", "failed", "canceled", "rejected"];

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    let comercioId: string;
    if (await esAdmin(req)) {
      if (typeof body.comercio_id !== "string") throw new HttpError(400, "Falta comercio_id");
      comercioId = body.comercio_id;
    } else {
      const pedido = typeof body.comercio_id === "string" ? body.comercio_id : undefined;
      comercioId = (await comercioDeSesion(req, sb, pedido)).id;
    }
    const conexion = await conexionEcartPay(sb, [comercioId]);
    if (!conexion) throw new HttpError(409, "El comercio no tiene Ecart Pay conectado");
    const ecart = await clienteDeConexion(sb, conexion);
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
      if (e instanceof EcartPayError) throw new HttpError(502, `Ecart Pay: ${e.message}`);
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
