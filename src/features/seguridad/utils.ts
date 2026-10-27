import type { Miembro } from "./estados";

export type FormPassword = { actual: string; nueva: string; repetir: string };

/** Mensaje de error del formulario de cambio de contraseña, o null si es válido. */
export function validarCambioPassword(pw: FormPassword): string | null {
  if (!pw.actual || !pw.nueva || !pw.repetir) return "Completá todos los campos";
  if (pw.nueva.length < 12) return "Mínimo 12 caracteres";
  if (pw.nueva !== pw.repetir) return "Las contraseñas no coinciden";
  return null;
}

/** Mensaje de error de la invitación (email ya normalizado), o null si es válida. */
export function validarInvitacion(email: string, nombre: string, team: Miembro[]): string | null {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Ingresá un email válido";
  if (team.some((m) => m.e.toLowerCase() === email)) return "Ese email ya es miembro del equipo";
  if (!nombre) return "Ingresá el nombre del miembro";
  return null;
}

/** Valida el tiempo de sesión personalizado (en minutos). */
export const tiempoCustomValido = (minutos: string) => !!minutos && Number(minutos) >= 1;
