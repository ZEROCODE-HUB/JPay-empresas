import type { Cliente, DocumentoCliente } from "@/lib/api/cuenta";
import type { TablesUpdate } from "@/lib/database.types";
import { TIPO_DOC_LABEL } from "./estados";
import type { ClienteForm, DocReal } from "./types";

const IMG_EXT = [
  "png",
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "jif",
  "webp",
  "gif",
  "bmp",
  "heic",
  "avif",
  "tiff",
  "tif",
];

export function kindOf(label: string, url: string): DocReal["kind"] {
  const ext = (label || url).split(".").pop()?.toLowerCase() ?? "";
  if (IMG_EXT.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "file";
}

export function mapDocumentos(docs: DocumentoCliente[]): DocReal[] {
  return docs.map((d) => ({
    tipo: TIPO_DOC_LABEL[d.tipo] ?? d.tipo,
    rawTipo: d.tipo,
    label: d.label ?? d.url,
    url: d.url as string,
    signedUrl: d.signedUrl,
    kind: kindOf(d.label ?? d.url, d.url as string),
    date: d.created_at,
  }));
}

export function clienteToForm(c: Cliente): ClienteForm {
  const [n, ...rest] = (c.nombre ?? "").split(" ");
  return {
    nombre: n ?? "",
    apellido: rest.join(" "),
    nombreLegal: c.nombre_legal ?? "",
    nombreFantasia: c.nombre_fantasia ?? "",
    cuit: c.cuit ?? "",
    tipo_sociedad: c.tipo_sociedad ?? "",
    fecha_inscripcion: c.fecha_inscripcion ?? "",
    direccion: c.direccion ?? "",
    ciudad: c.ciudad ?? "",
    provincia: c.provincia ?? "",
    cp: c.cp ?? "",
    telefono: c.telefono ?? "",
    actividad: c.actividad ?? "",
    genero: c.genero ?? "",
    cuit_cuil: c.cuit_cuil ?? "",
    fecha_nacimiento: c.fecha_nacimiento ?? "",
    ocupacion: c.ocupacion ?? "",
    origen_fondos: c.origen_fondos ?? "",
    es_pep: c.es_pep ?? false,
  };
}

export function formToPatch(form: Partial<ClienteForm>): TablesUpdate<"clientes"> {
  return {
    nombre: `${form.nombre ?? ""} ${form.apellido ?? ""}`.trim(),
    nombre_legal: form.nombreLegal || null,
    nombre_fantasia: form.nombreFantasia || null,
    // `cuit` es NOT NULL en la base: si queda vacío no se envía y se conserva el actual.
    cuit: form.cuit || undefined,
    tipo_sociedad: form.tipo_sociedad || null,
    fecha_inscripcion: form.fecha_inscripcion || null,
    direccion: form.direccion || null,
    ciudad: form.ciudad || null,
    provincia: form.provincia || null,
    cp: form.cp || null,
    telefono: form.telefono || null,
    actividad: form.actividad || null,
    genero: form.genero || null,
    cuit_cuil: form.cuit_cuil || null,
    fecha_nacimiento: form.fecha_nacimiento || null,
    ocupacion: form.ocupacion || null,
    origen_fondos: form.origen_fondos || null,
    es_pep: !!form.es_pep,
  };
}

/** Antigüedad legible ("Reciente", "5 meses", "2 años 3 meses") desde `base` hasta `now`. */
export function antiguedad(base: Date | null, now: Date = new Date()): string {
  if (!base) return "—";
  const months = (now.getFullYear() - base.getFullYear()) * 12 + (now.getMonth() - base.getMonth());
  if (months < 1) return "Reciente";
  if (months < 12) return `${months} meses`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem
    ? `${years} año${years > 1 ? "s" : ""} ${rem} mes${rem > 1 ? "es" : ""}`
    : `${years} año${years > 1 ? "s" : ""}`;
}

/** Score de seguridad (0-100) de la ficha; 86 si todavía no hay cliente. */
export function scoreSeguridad(
  cliente: Pick<Cliente, "direccion" | "telefono"> | null,
  aprobado: boolean,
  cantDocs: number,
): number {
  if (!cliente) return 86;
  let s = 55;
  if (aprobado) s += 20;
  if (cliente.direccion) s += 8;
  if (cliente.telefono) s += 7;
  s += Math.min(10, cantDocs * 2.5);
  return Math.min(100, Math.round(s));
}

export function labelKyc(aprobado: boolean, estadoOnboarding: string | null | undefined): string {
  if (aprobado) return "Validado";
  if (estadoOnboarding === "pendiente") return "Pendiente";
  if (estadoOnboarding === "rechazado") return "Rechazado";
  return "Pendiente";
}
