import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TipoCuenta = "fisica" | "juridica";

export type Registro = {
  nombre: string;
  apellido: string;
  fechaNac: string;
  email: string;
  password?: string;
};

export type DatosPersonales = {
  genero: string;
  cuitCuil: string;
  ocupacion: string;
  origenFondos: string;
  esPEP: boolean;
};

export type DatosEmpresa = {
  cuit: string;
  fechaInscripcion: string;
  tipoId: string;
  nombreLegal: string;
  nombreFantasia: string;
};

export type FileRef = { name: string; url?: string; file?: File } | null;

export type KYC = {
  dniFrente: FileRef;
  dniDorso: FileRef;
  servicio: FileRef;
  selfie: FileRef;
  direccion: string;
  direccion2: string;
  ciudad: string;
  provincia: string;
  cp: string;
};

export type EstadoOnboarding =
  | "pendiente_verificacion"
  | "registrado"
  | "preactivado"
  | "activado"
  | "suspendido"
  | "deshabilitado"
  | "eliminado";

type State = {
  tipoCuenta: TipoCuenta | null;
  registro: Partial<Registro>;
  datosPersonales: Partial<DatosPersonales>;
  datosEmpresa: Partial<DatosEmpresa>;
  kyc: Partial<KYC>;
  emailValidado: boolean;
  aprobado: boolean;
  // Homologado con Admin: estado canonico del flujo
  estado: EstadoOnboarding;
  setTipo: (t: TipoCuenta) => void;
  setRegistro: (r: Partial<Registro>) => void;
  setDatosPersonales: (d: Partial<DatosPersonales>) => void;
  setDatosEmpresa: (d: Partial<DatosEmpresa>) => void;
  setKyc: (k: Partial<KYC>) => void;
  markEmailValidado: () => void;
  markAprobado: () => void;
  setEstado: (e: EstadoOnboarding) => void;
  reset: () => void;
};

const initial = {
  tipoCuenta: null as TipoCuenta | null,
  registro: {},
  datosPersonales: {},
  datosEmpresa: {},
  kyc: {},
  emailValidado: false,
  aprobado: false,
  estado: "pendiente_verificacion" as EstadoOnboarding,
};

export const useOnboarding = create<State>()(
  persist(
    (set) => ({
      ...initial,
      setTipo: (t) => set({ tipoCuenta: t }),
      setRegistro: (r) => set((s) => ({ registro: { ...s.registro, ...r } })),
      setDatosPersonales: (d) => set((s) => ({ datosPersonales: { ...s.datosPersonales, ...d } })),
      setDatosEmpresa: (d) => set((s) => ({ datosEmpresa: { ...s.datosEmpresa, ...d } })),
      setKyc: (k) => set((s) => ({ kyc: { ...s.kyc, ...k } })),
      markEmailValidado: () => set({ emailValidado: true, estado: "registrado" }),
      markAprobado: () => set({ aprobado: true }),
      setEstado: (e) => set({ estado: e }),
      reset: () => set(initial),
    }),
    {
      name: "onboarding-state",
      partialize: (s) => ({
        tipoCuenta: s.tipoCuenta,
        registro: {
          nombre: s.registro.nombre,
          apellido: s.registro.apellido,
          fechaNac: s.registro.fechaNac,
          email: s.registro.email,
        },
        datosPersonales: s.datosPersonales,
        datosEmpresa: s.datosEmpresa,
        kyc: {
          direccion: s.kyc.direccion,
          direccion2: s.kyc.direccion2,
          ciudad: s.kyc.ciudad,
          provincia: s.kyc.provincia,
          cp: s.kyc.cp,
        },
        emailValidado: s.emailValidado,
        aprobado: s.aprobado,
        estado: s.estado,
      }),
    },
  ),
);

export const PROVINCIAS = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

export const OCUPACIONES = [
  "Empleado en relación de dependencia",
  "Autónomo / Monotributista",
  "Empresario",
  "Profesional independiente",
  "Jubilado / Pensionado",
  "Estudiante",
  "Otro",
];

export const ORIGEN_FONDOS = [
  "Sueldo",
  "Ahorros",
  "Venta de activos",
  "Herencia",
  "Inversiones",
  "Actividad comercial",
  "Otro",
];

export const TIPOS_SOCIEDAD = [
  "Sociedad Anónima (SA)",
  "Sociedad de Responsabilidad Limitada (SRL)",
  "Sociedad por Acciones Simplificada (SAS)",
  "Sociedad Colectiva",
  "Sociedad en Comandita",
  "Cooperativa",
  "Asociación Civil",
  "Otro",
];
