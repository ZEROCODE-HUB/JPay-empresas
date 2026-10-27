export type EstadoLogin = "aprobado" | "pendiente" | "rechazado";

export type DatosRegistro = {
  nombre: string;
  apellido: string;
  fechaNac: string;
  email: string;
  password: string;
};

export function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Homologa el estado del cliente en la base al estado que maneja el login. */
export function estadoLoginDesdeCliente(raw: string): EstadoLogin {
  if (raw === "activado" || raw === "activo") return "aprobado";
  if (raw === "deshabilitado" || raw === "eliminado" || raw === "rechazado") return "rechazado";
  return "pendiente";
}

/** "Email not confirmed" de Supabase: la cuenta existe pero falta verificar el correo. */
export function esEmailNoConfirmado(mensaje: string) {
  return /email not confirmed/i.test(mensaje);
}
