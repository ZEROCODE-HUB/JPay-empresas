import type { DestinatarioSpei, EstadoSpei } from "@/lib/api/cobre";

type Tono = "success" | "warn" | "danger" | "neutral";

/** Verificación del destinatario: titular de la CLABE (SPEI) o beneficiario en dólares. */
export const VERIFICACION: Record<DestinatarioSpei["verificacion"], { label: string; tone: Tono }> =
  {
    sin_verificar: { label: "Sin verificar", tone: "neutral" },
    procesando: { label: "Verificando titular…", tone: "warn" },
    matched: { label: "Titular verificado", tone: "success" },
    unmatched: { label: "El titular no coincide", tone: "danger" },
    unresolved: { label: "No se pudo verificar (se reintenta en 12 h)", tone: "warn" },
    verified: { label: "Verificado", tone: "success" },
    rejected: { label: "Rechazado por Cobre", tone: "danger" },
    failed: { label: "No se pudo verificar", tone: "danger" },
  };

/** Estado de un envío (SPEI, Fedwire o SWIFT). */
export const ESTADO_ENVIO: Record<EstadoSpei, { label: string; tone: Tono }> = {
  enviando: { label: "Enviando", tone: "warn" },
  pendiente: { label: "En proceso", tone: "warn" },
  pendiente_aprobacion: { label: "Esperando aprobación", tone: "warn" },
  trasladando: { label: "Preparando el envío", tone: "warn" },
  completada: { label: "Completada", tone: "success" },
  rechazada: { label: "Rechazada", tone: "danger" },
  fallida: { label: "Fallida", tone: "danger" },
  cancelada: { label: "Cancelada", tone: "neutral" },
  error_envio: { label: "No enviada", tone: "danger" },
  devuelta: { label: "Devuelta por el banco", tone: "danger" },
};
