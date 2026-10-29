// Edge Function: conversión de pesos a dólares con Cobre (Solution Design §4.4). Body: { accion, … }.
// Solo el comercio, con su sesión, y solo en la instancia matriz de JPay.
//
// - `cotizar` { subcuenta_id, monto_mxn }: cotización `static_quote` `mxn/usd`. Vale 25 s;
//   devuelve tasa, dólares que recibe, comisión (`fees_breakdown`), vencimiento y si está fuera
//   del horario de mercado (05:00–16:00 UTC−5).
// - `convertir` { cruce_id }: con la cotización vigente reserva los pesos y crea el Cross
//   Border hacia el Balance Global de JPay. Vencida → hay que cotizar de nuevo (nunca se reintenta
//   con una cotización vieja). Los dólares entran a la subcuenta USD al `completed`.
// - `consultar` { cruce_id }: trae el estado de Cobre y lo aplica.

import { CobreError } from "../_shared/cobre.ts";
import { conexionDeCliente } from "../_shared/cobre-servidor.ts";
import {
  aplicarEstadoCruce,
  cotizarCruce,
  ejecutarCruce,
  enHorarioMercado,
} from "../_shared/cobre-usd.ts";
import { handler, HttpError, json, readJson, serviceClient, userClient } from "../_shared/http.ts";

type Obj = Record<string, unknown>;

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Obj>(req);
    const sb = serviceClient();
    const { data: legajo, error } = await userClient(req).rpc("current_cliente_legajo");
    if (error || typeof legajo !== "string" || !legajo)
      throw new HttpError(403, "Cliente no encontrado");
    const conexion = await conexionDeCliente(sb, legajo);

    const cruce = async () => {
      const { data } = await sb
        .from("cobre_cruces")
        .select("*")
        .eq("id", String(body.cruce_id ?? ""))
        .eq("cliente_legajo", legajo)
        .maybeSingle();
      if (!data) throw new HttpError(404, "Conversión inexistente");
      return data as Obj;
    };

    try {
      switch (body.accion) {
        case "cotizar": {
          const subcuenta = String(body.subcuenta_id ?? "");
          const { data: s } = await sb
            .from("subaccounts")
            .select("id, moneda, estado")
            .eq("id", subcuenta)
            .eq("cliente_legajo", legajo)
            .maybeSingle();
          if (!s || s.estado !== "Activa" || (s.moneda && s.moneda !== "MXN")) {
            throw new HttpError(400, "Elegí una subcuenta activa en pesos");
          }
          const monto = Math.round(Number(body.monto_mxn) * 100) / 100;
          if (!(monto > 0)) throw new HttpError(400, "Monto inválido");
          const fila = await cotizarCruce(sb, conexion, {
            legajo,
            subcuentaMxnId: s.id,
            montoMxn: monto,
          });
          return json({ ...fila, en_horario: enHorarioMercado() });
        }
        case "convertir":
          return json(await ejecutarCruce(sb, conexion, await cruce()));
        case "consultar": {
          const c = await cruce();
          if (
            c.mm_id &&
            !["completada", "rechazada", "fallida", "vencida", "error_envio"].includes(
              String(c.estado),
            )
          ) {
            await aplicarEstadoCruce(
              sb,
              conexion,
              await conexion.cliente.get(`/cross_border_money_movements/${c.mm_id}`),
              null,
            );
          }
          return json(await cruce());
        }
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
