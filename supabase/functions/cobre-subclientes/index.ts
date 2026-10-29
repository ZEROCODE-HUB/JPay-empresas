// Edge Function: alta del comercio en Cobre como Subcliente (Solution Design §4.1, onboarding
// FBO). Body: { accion, legajo? }.
//
// - `estado` { legajo? } (admin, o el propio comercio sin legajo): datos KYB que tiene JPay, lo
//   que falta para el alta, la última alta enviada y el Balance del comercio.
// - `enviar` { legajo } (solo admin): valida, guarda la fila con su `Idempotency-Key` y llama a
//   `POST /subclients`. Un Subcliente `rejected` o `failed` no se reenvía: se crea otro registro
//   (con los datos ya corregidos en JPay).
// - `consultar` { legajo } (solo admin): `GET /subclients/{id}` y aplica el estado (al
//   `approved` crea el Cobre Balance del comercio). El aviso `subclient.status.*` hace lo mismo.
// Solo para la instancia matriz: un comercio con instancia Cobre propia no tiene Subcliente.

import { CobreError, subclienteCobre } from "../_shared/cobre.ts";
import { conexionCobre, instanciaDeCliente } from "../_shared/cobre-servidor.ts";
import {
  aplicarEstadoSubcliente,
  crearBalanceComercio,
  datosKybDeCliente,
} from "../_shared/cobre-subclientes.ts";
import {
  bearerToken,
  esAdmin,
  handler,
  HttpError,
  json,
  readJson,
  serviceClient,
  userClient,
} from "../_shared/http.ts";

type Body = { accion?: unknown; legajo?: unknown };

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    const sb = serviceClient();
    const admin = await esAdmin(req);
    const legajo = admin ? String(body.legajo ?? "").trim() : await legajoDeSesion(req);
    if (!legajo) throw new HttpError(400, "Falta el legajo");
    if (body.accion !== "estado" && !admin) throw new HttpError(403, "Solo para administradores");

    const conexion = conexionCobre(sb);
    try {
      switch (body.accion) {
        case "estado":
          return json(await estado(legajo));
        case "enviar":
          return json(await enviar(legajo, req));
        case "consultar":
          return json(await consultar(legajo));
        case "revocado_revisado": {
          // El backoffice ya consultó con el KAM el rechazo posterior a la aprobación.
          const alta = await ultima();
          if (!alta?.revocado_at) throw new HttpError(409, "El alta no tiene un rechazo posterior");
          const { error } = await sb
            .from("cobre_subclientes")
            .update({ revocado_revisado: true })
            .eq("id", alta.id);
          if (error) throw new Error(error.message);
          return json({ ok: true });
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

    async function ultima() {
      const { data } = await sb
        .from("cobre_subclientes")
        .select(
          "id, cliente_legajo, modo, subcliente_externo_id, estado, motivo, balance_pedido_at, created_at, updated_at, revocado_at, revocado_motivo, revocado_revisado",
        )
        .eq("cliente_legajo", legajo)
        .eq("modo", conexion.modo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    }

    async function estado(l: string) {
      const [datos, alta, { data: cuenta }, instancia] = await Promise.all([
        datosKybDeCliente(sb, l),
        ultima(),
        sb
          .from("cobre_cuentas")
          .select("id, cuenta_externa_id, clabe, conectividad, subcuenta_id, created_at")
          .eq("tipo", "cliente")
          .eq("cliente_legajo", l)
          .eq("modo", conexion.modo)
          .eq("estado", "activa")
          .maybeSingle(),
        instanciaDeCliente(sb, l).catch(() => null),
      ]);
      const { faltan } = subclienteCobre(datos);
      return {
        modo: conexion.modo,
        instanciaPropia: !!instancia,
        faltan,
        alta,
        cuenta,
        datos,
      };
    }

    async function enviar(l: string, r: Request) {
      if (await instanciaDeCliente(sb, l)) {
        throw new HttpError(
          409,
          "El comercio opera con su propia instancia de Cobre: no lleva Subcliente",
        );
      }
      const previa = await ultima();
      if (previa && ["enviando", "processing", "approved"].includes(previa.estado)) {
        throw new HttpError(409, `Ya hay un alta ${previa.estado}`);
      }
      const { cuerpo, faltan } = subclienteCobre(await datosKybDeCliente(sb, l));
      if (faltan.length) throw new HttpError(400, `Faltan datos: ${faltan.join(", ")}`);
      const { data: u } = await sb.auth.getUser(bearerToken(r) ?? "");
      const clave = `SC-${l}-${crypto.randomUUID().slice(0, 8)}`;
      const { data: fila, error } = await sb
        .from("cobre_subclientes")
        .insert({
          cliente_legajo: l,
          modo: conexion.modo,
          idempotency_key: clave,
          datos_enviados: cuerpo,
          creado_por: u?.user?.email ?? "admin",
        })
        .select("*")
        .single();
      if (error) throw new HttpError(409, error.message);
      let sc: Record<string, unknown>;
      try {
        sc = await conexion.cliente.post<Record<string, unknown>>(
          "/subclients",
          cuerpo,
          undefined,
          {
            "Idempotency-Key": clave,
          },
        );
      } catch (e) {
        if (
          e instanceof CobreError &&
          e.status >= 400 &&
          e.status < 500 &&
          e.status !== 408 &&
          e.status !== 429
        ) {
          await sb
            .from("cobre_subclientes")
            .update({
              estado: "error_envio",
              motivo: e.message,
              updated_at: new Date().toISOString(),
            })
            .eq("id", fila.id);
        }
        throw e;
      }
      const externo = typeof sc.id === "string" ? sc.id : null;
      if (!externo) throw new HttpError(502, "Cobre no devolvió el id del Subcliente");
      await sb
        .from("cobre_subclientes")
        .update({
          subcliente_externo_id: externo,
          estado: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", fila.id);
      const resultado = await aplicarEstadoSubcliente(sb, conexion, sc);
      return { ...(await estado(l)), resultado };
    }

    async function consultar(l: string) {
      const alta = await ultima();
      if (!alta?.subcliente_externo_id)
        throw new HttpError(404, "El comercio no tiene un alta enviada");
      const sc = await conexion.cliente.get(`/subclients/${alta.subcliente_externo_id}`);
      let resultado = await aplicarEstadoSubcliente(sb, conexion, sc);
      // Aprobado pero sin Balance (p. ej. falló la creación): se reintenta.
      if (alta.estado === "approved" && !/Balance/.test(resultado)) {
        resultado = await crearBalanceComercio(sb, conexion, alta);
      }
      return { ...(await estado(l)), resultado };
    }
  }),
);

async function legajoDeSesion(req: Request): Promise<string> {
  const { data, error } = await userClient(req).rpc("current_cliente_legajo");
  if (error || typeof data !== "string" || !data) throw new HttpError(403, "Cliente no encontrado");
  return data;
}
