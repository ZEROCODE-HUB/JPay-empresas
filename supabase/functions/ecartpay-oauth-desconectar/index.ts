// Edge Function: desconecta la cuenta Ecart Pay de un comercio (Fase 3).
// La puede pedir el cliente dueño del comercio o un admin. Marca la conexión como `revocado`
// y borra la clave privada de Vault. El permiso en Ecart Pay lo revoca el comercio desde su
// panel (no hay endpoint documentado para revocarlo desde la plataforma).
// Body: { comercio_id?: string } (obligatorio para admins).

import { comercioDeSesion } from "../_shared/conexiones.ts";
import { esAdmin, handler, HttpError, json, readJson, serviceClient } from "../_shared/http.ts";

Deno.serve(
  handler(async (req) => {
    const body = await readJson<{ comercio_id?: string }>(req);
    const sb = serviceClient();

    let comercioId: string;
    if (await esAdmin(req)) {
      if (!body.comercio_id) throw new HttpError(400, "Falta comercio_id");
      comercioId = body.comercio_id;
    } else {
      comercioId = (await comercioDeSesion(req, sb, body.comercio_id)).id;
    }

    const { data: conexiones, error } = await sb
      .from("comercio_proveedores")
      .select("id")
      .eq("comercio_id", comercioId)
      .eq("proveedor", "ecartpay")
      .neq("estado", "revocado");
    if (error) throw new HttpError(500, error.message);

    for (const c of conexiones ?? []) {
      const { error: e1 } = await sb.rpc("proveedor_borrar_secreto", { p_conexion_id: c.id });
      if (e1) throw new HttpError(500, e1.message);
      const { error: e2 } = await sb
        .from("comercio_proveedores")
        .update({
          estado: "revocado",
          revocado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      if (e2) throw new HttpError(500, e2.message);
    }
    return json({ ok: true, desconectadas: conexiones?.length ?? 0 });
  }),
);
