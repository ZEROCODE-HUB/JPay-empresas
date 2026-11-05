import { requireSupabase } from "@/lib/supabase";

/**
 * Envía por correo el código de verificación (2FA) que piden las transferencias SPEI y en
 * dólares. Se relanza el error original para que `extraerMensajeEdgeFunction` pueda leer el
 * cuerpo de la respuesta.
 */
export async function enviarOtpTransferencia(): Promise<{ demo_codigo?: string }> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<{ error?: string; demo_codigo?: string }>(
    "enviar-otp-transferencia",
    { body: {} },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { demo_codigo: data?.demo_codigo };
}
