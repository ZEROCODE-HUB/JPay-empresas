export type DocReal = {
  tipo: string;
  rawTipo: string;
  label: string;
  url: string;
  signedUrl: string | null;
  kind: "image" | "pdf" | "file";
  date?: string;
};

export type ClienteForm = {
  nombre: string;
  apellido: string;
  nombreLegal: string;
  nombreFantasia: string;
  cuit: string;
  tipo_sociedad: string;
  fecha_inscripcion: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  cp: string;
  telefono: string;
  actividad: string;
  genero: string;
  cuit_cuil: string;
  fecha_nacimiento: string;
  ocupacion: string;
  origen_fondos: string;
  es_pep: boolean;
};

export type CampoTexto = Exclude<keyof ClienteForm, "es_pep">;
