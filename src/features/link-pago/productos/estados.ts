export type Tono = "neutral" | "success" | "warn" | "danger";

/** Tono del badge segun el estado mostrado del link (ver `linkDisplayStatus`). */
export function toneEstadoLink(estado: string): Tono {
  if (estado === "Activo") return "success";
  if (estado === "Inactivo") return "neutral";
  return "danger";
}
