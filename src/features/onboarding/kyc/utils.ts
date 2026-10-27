import type {
  DatosEmpresa,
  DatosPersonales,
  FileRef,
  Registro,
  TipoCuenta,
} from "@/lib/onboarding-store";
import type { DocumentoKyc } from "@/lib/api/onboarding";

export const STEPS = ["DNI", "Servicio", "Selfie", "Residencia"];

export const CLAVES_ARCHIVOS = ["dniFrente", "dniDorso", "servicio", "selfie"] as const;

export type ArchivosKyc = Record<(typeof CLAVES_ARCHIVOS)[number], FileRef>;

export type Domicilio = {
  direccion: string;
  direccion2: string;
  ciudad: string;
  provincia: string;
  cp: string;
};

export const ARCHIVOS_VACIOS: ArchivosKyc = {
  dniFrente: null,
  dniDorso: null,
  servicio: null,
  selfie: null,
};

const TIPO_DOCUMENTO: Record<string, keyof ArchivosKyc> = {
  id_frente: "dniFrente",
  id_dorso: "dniDorso",
  servicio: "servicio",
  selfie: "selfie",
};

/** Documentos ya enviados → valores de FileUpload (sin `file` = ya cargado). */
export function archivosDesdeDocumentos(docs: DocumentoKyc[]): ArchivosKyc {
  const next: ArchivosKyc = { ...ARCHIVOS_VACIOS };
  for (const d of docs) {
    const key = TIPO_DOCUMENTO[d.tipo];
    if (!key) continue;
    // FileUpload espera {name, url}; sin file significa ya cargado
    next[key] = {
      name: d.label || (d.url as string).split("/").pop() || d.tipo,
      url: d.signedUrl ?? undefined,
    };
  }
  return next;
}

/** Si el paso actual tiene lo necesario para avanzar. */
export function puedeAvanzar(step: number, files: ArchivosKyc): boolean {
  return Boolean(
    (step === 0 && files.dniFrente && files.dniDorso) ||
    (step === 1 && files.servicio) ||
    (step === 2 && files.selfie) ||
    step === 3,
  );
}

/** Errores del domicilio (vacío = válido). */
export function validarDomicilio(addr: Domicilio): Record<string, string> {
  const e: Record<string, string> = {};
  if (!addr.direccion.trim()) e.direccion = "Requerido";
  if (!addr.ciudad.trim()) e.ciudad = "Requerido";
  if (!addr.provincia) e.provincia = "Requerido";
  if (!addr.cp.trim()) e.cp = "Requerido";
  return e;
}

/** Perfil, CUIT y nombre que se envían en el alta según el tipo de cuenta. */
export function armarAlta(
  addr: Domicilio,
  tipoCuenta: TipoCuenta | null,
  registro: Partial<Registro>,
  datosPersonales: Partial<DatosPersonales>,
  datosEmpresa: Partial<DatosEmpresa>,
) {
  const perfil: Record<string, unknown> = {
    direccion: addr.direccion,
    direccion2: addr.direccion2,
    ciudad: addr.ciudad,
    provincia: addr.provincia,
    cp: addr.cp,
    fechaNacimiento: registro.fechaNac ?? null,
  };
  let cuit: string;
  if (tipoCuenta === "juridica") {
    cuit = datosEmpresa.cuit ?? "";
    perfil.tipoSociedad = datosEmpresa.tipoId;
    perfil.nombreLegal = datosEmpresa.nombreLegal;
    perfil.nombreFantasia = datosEmpresa.nombreFantasia;
    perfil.fechaInscripcion = datosEmpresa.fechaInscripcion;
  } else {
    cuit = datosPersonales.cuitCuil ?? "";
    perfil.genero = datosPersonales.genero;
    perfil.cuitCuil = datosPersonales.cuitCuil;
    perfil.ocupacion = datosPersonales.ocupacion;
    perfil.origenFondos = datosPersonales.origenFondos;
    perfil.esPEP = datosPersonales.esPEP;
  }
  const nombre =
    tipoCuenta === "juridica"
      ? datosEmpresa.nombreLegal || registro.nombre
      : `${registro.nombre} ${registro.apellido}`.trim();
  return { perfil, cuit, nombre };
}
