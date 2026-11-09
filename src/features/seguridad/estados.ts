// Pantalla Seguridad. El registro de actividad y el equipo todavía no salen de la base: quedan
// vacíos (antes eran datos de ejemplo).

export type Tono = "neutral" | "success" | "warn" | "danger";

export type Miembro = { n: string; e: string; r: string; a: string };

export type EventoActividad = { d: string; ip: string; f: string; ok: boolean };

export const LOG_ACTIVIDAD: EventoActividad[] = [];

export const EQUIPO_INICIAL: Miembro[] = [];

export const OPCIONES_TIEMPO_SESION = ["Nunca", "30 minutos", "1 hora", "6 horas", "1 dia"];

export const ROLES_EQUIPO = ["Owner", "Operador", "Solo lectura", "Admin"];

/** Estado de un miembro del equipo → tono del badge. */
export const tonoMiembro = (estado: string): Tono => (estado === "Activa" ? "success" : "warn");
