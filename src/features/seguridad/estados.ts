// Datos de ejemplo de la pantalla Seguridad (todavía no salen de la base).

export type Tono = "neutral" | "success" | "warn" | "danger";

export type Sesion = { d: string; l: string; ip: string; f: string; curr: boolean };
export type Miembro = { n: string; e: string; r: string; a: string };

export const LOG_ACTIVIDAD = [
  { d: "Inicio de sesion exitoso", ip: "190.12.44.21", f: "Hoy 09:12", ok: true },
  { d: "Cambio de contrasena", ip: "190.12.44.21", f: "12/05/2026", ok: true },
  { d: "Intento fallido de login", ip: "45.220.88.10", f: "08/05/2026", ok: false },
  { d: "Nuevo dispositivo autorizado", ip: "190.12.44.21", f: "01/05/2026", ok: true },
  { d: "API Key rotada", ip: "190.12.44.21", f: "28/04/2026", ok: true },
];

export const EQUIPO_INICIAL: Miembro[] = [
  { n: "Carla Rivas", e: "carla@empresademo.com", r: "Owner", a: "Activa" },
  { n: "Diego Mendez", e: "diego@empresademo.com", r: "Operador", a: "Activa" },
  { n: "Sofia Lopez", e: "sofia@empresademo.com", r: "Solo lectura", a: "Pendiente" },
];

export const SESIONES_INICIALES: Sesion[] = [
  {
    d: "Chrome · MacBook Pro",
    l: "Buenos Aires, AR",
    ip: "190.12.44.21",
    f: "Activa ahora",
    curr: true,
  },
  {
    d: "Safari · iPhone 14",
    l: "Buenos Aires, AR",
    ip: "190.12.44.21",
    f: "Hace 2 horas",
    curr: false,
  },
  { d: "Firefox · Windows", l: "Cordoba, AR", ip: "200.40.18.92", f: "Hace 3 dias", curr: false },
];

export const OPCIONES_TIEMPO_SESION = ["Nunca", "30 minutos", "1 hora", "6 horas", "1 dia"];

export const ROLES_EQUIPO = ["Owner", "Operador", "Solo lectura", "Admin"];

/** Estado de un miembro del equipo → tono del badge. */
export const tonoMiembro = (estado: string): Tono => (estado === "Activa" ? "success" : "warn");
