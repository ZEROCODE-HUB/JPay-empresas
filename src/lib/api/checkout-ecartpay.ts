import { requireSupabase } from "@/lib/supabase";
import { DataAccessError } from "./errors";

/**
 * Checkout público con Ecart Pay (Edge Function `ecartpay-checkout`): el pagador completa el
 * pago en la página de Ecart Pay y vuelve a /p/$code?pago=<id>. El estado final siempre lo
 * confirma el servidor consultando la orden.
 */

export type EstadoPagoEcart =
  | "creado"
  | "pendiente"
  | "pagado"
  | "rechazado"
  | "cancelado"
  | "reembolsado"
  | "parcialmente_reembolsado"
  | "error";

export type PagoEcart = {
  estado: EstadoPagoEcart;
  monto: number;
  moneda: string;
  motivo: string | null;
  metodo?: string | null;
  pagado_at?: string | null;
  orden_id?: string | null;
  referencia?: string | null;
  referencia_vence_at?: string | null;
  referencia_url?: string | null;
};

/** Cómo paga el cliente: en la página de Ecart Pay (tarjeta) o con referencia (SPEI / OXXO). */
export type MetodoCheckout = "tarjeta" | "spei" | "oxxo";

/** Tope por pago en OXXO (Ecart Pay). */
export const TOPE_OXXO = 11_000;

export type PagoCreado =
  | { pago_id: string; pay_link: string }
  | { pago_id: string; metodo: "spei" | "oxxo"; referencia: string; vence_at: string | null };

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<T>("ecartpay-checkout", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo =
      ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new DataAccessError(cuerpo?.error ? new Error(cuerpo.error) : error);
  }
  return data as T;
}

/** ¿El comercio del link cobra con Ecart Pay? */
export function infoEcartPay(code: string) {
  return invocar<{ disponible: boolean; comercio: string | null }>({ accion: "info", code });
}

export function crearPagoEcartPay(input: {
  code: string;
  metodo: MetodoCheckout;
  idempotencyKey: string;
  monto: number;
  nombre: string;
  email: string;
}) {
  return invocar<PagoCreado>({
    accion: "crear",
    metodo: input.metodo,
    code: input.code,
    idempotency_key: input.idempotencyKey,
    monto: input.monto,
    pagador: { nombre: input.nombre, email: input.email },
    volver_a: `${window.location.origin}/p/${encodeURIComponent(input.code)}`,
  });
}

export function confirmarPagoEcartPay(pagoId: string) {
  return invocar<PagoEcart>({ accion: "confirmar", pago_id: pagoId });
}

/** Estados en los que conviene volver a consultar (la orden todavía puede cambiar). */
export const esEstadoAbierto = (e: EstadoPagoEcart) => e === "creado" || e === "pendiente";
