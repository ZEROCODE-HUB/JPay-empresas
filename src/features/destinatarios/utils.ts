import type { FrequentRecipient } from "@/lib/api/transferencias";

export type Destinatario = {
  /** id en `destinatarios_frecuentes` (vacío solo para filas efímeras). */
  id: string;
  n: string;
  a: string;
  cbu: string;
  b: string;
  fav: boolean;
  /** Fecha de alta en la agenda (ISO). */
  creadoEn?: string;
};

/**
 * Agenda real: `destinatarios_frecuentes` (migración 1012), misma tabla que
 * usa la pantalla de transferencias. Antes acá había data de ejemplo hardcodeada.
 */
export function aDestinatario(f: FrequentRecipient): Destinatario {
  return {
    id: f.id,
    n: f.nombre,
    a: f.alias || "",
    cbu: f.cbu,
    b: f.banco || "—",
    fav: false,
    creadoEn: f.creadoEn,
  };
}
