// Edge Function PÚBLICA (desplegar con --no-verify-jwt): manda los avisos por correo al cliente
// (depósitos, cobros, transferencias, lotes, contracargos, alta aprobada). pg_cron cada minuto;
// se limita a una vuelta cada 45 s (reservar_tarea). No recibe datos.
//
// Los avisos los encolan triggers en `avisos_correo` (migración 1078). Sin clave de correo
// configurada (modo demo) se marcan `sin_correo` y no se mandan después: no se acumulan.

import { avisoEmail, type EventoAviso } from "../_shared/avisos.ts";
import { configCorreo, sendEmail } from "../_shared/email.ts";
import { handler, json, serviceClient } from "../_shared/http.ts";

type Aviso = {
  id: string;
  cliente_legajo: string;
  evento: EventoAviso;
  datos: Record<string, unknown>;
  intentos: number;
};

const esDeEjemplo = (c: string) => /@[^>\s]*\.(example|test|invalid|localhost)\b/i.test(c);

Deno.serve(
  handler(async () => {
    const sb = serviceClient();
    const { data: toca } = await sb.rpc("reservar_tarea", {
      p_nombre: "avisos-correo",
      p_intervalo: "45 seconds",
    });
    if (toca !== true) return json({ omitido: true });

    const { data, error } = await sb.rpc("avisos_correo_tomar", { p_limite: 50 });
    if (error) throw new Error(error.message);
    const avisos = (data ?? []) as Aviso[];
    if (avisos.length === 0) return json({ enviados: 0 });

    const cfg = await configCorreo();
    const legajos = [...new Set(avisos.map((a) => a.cliente_legajo))];
    const { data: clientes } = await sb
      .from("clientes")
      .select("legajo, correo, nombre, nombre_fantasia")
      .in("legajo", legajos);
    const porLegajo = new Map((clientes ?? []).map((c) => [c.legajo as string, c]));

    const resumen = { enviados: 0, sin_correo: 0, errores: 0 };
    for (const a of avisos) {
      const c = porLegajo.get(a.cliente_legajo);
      const correo = (c?.correo as string | null)?.trim() || null;
      const marcar = (campos: Record<string, unknown>) =>
        sb.from("avisos_correo").update(campos).eq("id", a.id);

      if (!cfg.apiKey || !correo || esDeEjemplo(correo)) {
        await marcar({
          estado: "sin_correo",
          destinatario: correo,
          error: !cfg.apiKey
            ? "Correo sin configurar (modo demo)"
            : "El cliente no tiene un correo válido",
        });
        resumen.sin_correo++;
        continue;
      }
      try {
        const nombre =
          (c?.nombre_fantasia as string | null) || (c?.nombre as string | null) || null;
        await sendEmail(avisoEmail(a.evento, a.datos ?? {}, correo, nombre));
        await marcar({
          estado: "enviado",
          destinatario: correo,
          error: null,
          enviado_at: new Date().toISOString(),
        });
        resumen.enviados++;
      } catch (e) {
        await marcar({
          estado: "error",
          destinatario: correo,
          error: (e as Error).message.slice(0, 500),
        });
        resumen.errores++;
      }
    }
    return json(resumen);
  }),
);
