/**
 * Configuración por país: formato, moneda, identificadores, domicilio y textos que cambian
 * según dónde opera la plataforma. El país activo es el de la instalación (`country` en
 * `brand.json`); la tabla `paises` de la base guarda lo mismo para el servidor y el admin.
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 * Para sumar un país: agregar su configuración a `PAISES` y la fila en `paises`.
 */
import brandData from "@/brand/brand.json";
import {
  normalizarId,
  validarCbu,
  validarClabe,
  validarCuit,
  validarCurp,
  validarRfc,
  type Validador,
} from "./validadores";

export type CodigoPais = "MX" | "AR";
export type TipoPersona = "fisica" | "moral";

/** Un identificador (fiscal, personal o bancario) con su etiqueta y su validador. */
export type Identificador = {
  tipo: string;
  etiqueta: string;
  placeholder: string;
  ayuda?: string;
  /** Lo que se guarda: sin espacios ni guiones, en mayúsculas. */
  normalizar: (v: string) => string;
  validar: Validador;
};

export type RegimenFiscal = { codigo: string; nombre: string; persona: TipoPersona | "ambas" };

export type ConfigPais = {
  codigo: CodigoPais;
  nombre: string;
  locale: string;
  moneda: string;
  /** Símbolo y si va separado del número ("$ 1.234,50" vs "$1,234.50"). */
  simboloMoneda: string;
  espacioMoneda: boolean;
  timezone: string;
  prefijoTelefono: string;
  /** Identificador fiscal según el tipo de persona. */
  fiscal: Record<TipoPersona, Identificador>;
  /** Identificador personal de la persona física (CURP, DNI). */
  personal: Identificador | null;
  cuentaBancaria: Identificador;
  /** Documento de identidad que se sube en el KYC. */
  documentoIdentidad: string;
  domicilio: {
    region: string;
    regiones: string[];
    linea2: string;
    codigoPostal: string;
    /** Largo exacto del código postal (null = libre). */
    largoCodigoPostal: number | null;
  };
  tiposSociedad: string[];
  ocupaciones: string[];
  origenFondos: string[];
  regimenesFiscales: RegimenFiscal[];
  textos: {
    /** Leyenda regulatoria de la marca (null = no se muestra). */
    notaRegulatoria: string | null;
    /** Normativa de prevención de lavado que se cita al pedir datos personales. */
    normativaPld: string;
    /** Normativa de conservación de documentos del KYC. */
    normativaDocumentos: string;
    /** Definición de persona políticamente expuesta. */
    pep: string;
  };
};

const id = (
  tipo: string,
  etiqueta: string,
  placeholder: string,
  validar: Validador,
  ayuda?: string,
): Identificador => ({ tipo, etiqueta, placeholder, ayuda, normalizar: normalizarId, validar });

const MX: ConfigPais = {
  codigo: "MX",
  nombre: "México",
  locale: "es-MX",
  moneda: "MXN",
  simboloMoneda: "$",
  espacioMoneda: false,
  timezone: "America/Mexico_City",
  prefijoTelefono: "+52",
  fiscal: {
    fisica: id("RFC", "RFC", "GODE561231GR8", (v) => validarRfc(v, "fisica"), "13 caracteres"),
    moral: id(
      "RFC",
      "RFC de la empresa",
      "ABC010101AB1",
      (v) => validarRfc(v, "moral"),
      "12 caracteres",
    ),
  },
  personal: id("CURP", "CURP", "GODE561231MDFMZM04", validarCurp, "18 caracteres"),
  cuentaBancaria: id(
    "CLABE",
    "CLABE interbancaria",
    "032180000118359719",
    validarClabe,
    "18 dígitos",
  ),
  documentoIdentidad: "INE",
  domicilio: {
    region: "Estado",
    regiones: [
      "Aguascalientes",
      "Baja California",
      "Baja California Sur",
      "Campeche",
      "Chiapas",
      "Chihuahua",
      "Ciudad de México",
      "Coahuila",
      "Colima",
      "Durango",
      "Estado de México",
      "Guanajuato",
      "Guerrero",
      "Hidalgo",
      "Jalisco",
      "Michoacán",
      "Morelos",
      "Nayarit",
      "Nuevo León",
      "Oaxaca",
      "Puebla",
      "Querétaro",
      "Quintana Roo",
      "San Luis Potosí",
      "Sinaloa",
      "Sonora",
      "Tabasco",
      "Tamaulipas",
      "Tlaxcala",
      "Veracruz",
      "Yucatán",
      "Zacatecas",
    ],
    linea2: "Colonia",
    codigoPostal: "Código postal",
    largoCodigoPostal: 5,
  },
  tiposSociedad: [
    "Sociedad Anónima de Capital Variable (S.A. de C.V.)",
    "Sociedad de Responsabilidad Limitada (S. de R.L. de C.V.)",
    "Sociedad Anónima Promotora de Inversión (S.A.P.I. de C.V.)",
    "Sociedad por Acciones Simplificada (S.A.S.)",
    "Sociedad Civil (S.C.)",
    "Asociación Civil (A.C.)",
    "Sociedad Cooperativa",
    "Otro",
  ],
  ocupaciones: [
    "Empleado",
    "Trabajador independiente / Honorarios",
    "Empresario",
    "Profesionista",
    "Jubilado / Pensionado",
    "Estudiante",
    "Otro",
  ],
  origenFondos: [
    "Sueldo",
    "Ahorros",
    "Venta de activos",
    "Herencia",
    "Inversiones",
    "Actividad comercial",
    "Otro",
  ],
  regimenesFiscales: [
    { codigo: "601", nombre: "General de Ley Personas Morales", persona: "moral" },
    { codigo: "603", nombre: "Personas Morales con Fines no Lucrativos", persona: "moral" },
    {
      codigo: "605",
      nombre: "Sueldos y Salarios e Ingresos Asimilados a Salarios",
      persona: "fisica",
    },
    { codigo: "606", nombre: "Arrendamiento", persona: "fisica" },
    { codigo: "608", nombre: "Demás ingresos", persona: "fisica" },
    {
      codigo: "610",
      nombre: "Residentes en el Extranjero sin Establecimiento Permanente en México",
      persona: "ambas",
    },
    {
      codigo: "612",
      nombre: "Personas Físicas con Actividades Empresariales y Profesionales",
      persona: "fisica",
    },
    { codigo: "616", nombre: "Sin obligaciones fiscales", persona: "fisica" },
    {
      codigo: "620",
      nombre: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
      persona: "moral",
    },
    { codigo: "621", nombre: "Incorporación Fiscal", persona: "fisica" },
    {
      codigo: "622",
      nombre: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
      persona: "moral",
    },
    { codigo: "623", nombre: "Opcional para Grupos de Sociedades", persona: "moral" },
    { codigo: "624", nombre: "Coordinados", persona: "moral" },
    {
      codigo: "625",
      nombre: "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
      persona: "fisica",
    },
    { codigo: "626", nombre: "Régimen Simplificado de Confianza", persona: "ambas" },
  ],
  textos: {
    notaRegulatoria: null,
    normativaPld:
      "Estos datos son requeridos por la normativa de prevención de lavado de dinero (PLD) y solo se comparten con las autoridades competentes.",
    normativaDocumentos:
      "Tus documentos se procesan en un entorno cifrado y se conservan conforme a la normativa mexicana de protección de datos y de prevención de lavado de dinero.",
    pep: "Se consideran Personas Políticamente Expuestas (PEP) quienes desempeñan o desempeñaron funciones públicas destacadas en México o en el extranjero (por ejemplo, jefes de Estado o de gobierno, legisladores, funcionarios de alto nivel, mandos militares, directivos de empresas estatales o de partidos políticos), así como su cónyuge, concubino y parientes cercanos.",
  },
};

const AR: ConfigPais = {
  codigo: "AR",
  nombre: "Argentina",
  locale: "es-AR",
  moneda: "ARS",
  simboloMoneda: "$",
  espacioMoneda: true,
  timezone: "America/Argentina/Buenos_Aires",
  prefijoTelefono: "+54",
  fiscal: {
    fisica: id("CUIT", "CUIT / CUIL", "20-12345678-9", validarCuit, "11 dígitos"),
    moral: id("CUIT", "CUIT de la empresa", "30-12345678-9", validarCuit, "11 dígitos"),
  },
  personal: null,
  cuentaBancaria: id("CBU", "CBU / CVU", "0000000000000000000000", validarCbu, "22 dígitos"),
  documentoIdentidad: "DNI",
  domicilio: {
    region: "Provincia",
    regiones: [
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
    ],
    linea2: "Piso / Depto",
    codigoPostal: "Código postal",
    largoCodigoPostal: null,
  },
  tiposSociedad: [
    "Sociedad Anónima (SA)",
    "Sociedad de Responsabilidad Limitada (SRL)",
    "Sociedad por Acciones Simplificada (SAS)",
    "Sociedad Colectiva",
    "Sociedad en Comandita",
    "Cooperativa",
    "Asociación Civil",
    "Otro",
  ],
  ocupaciones: [
    "Empleado en relación de dependencia",
    "Autónomo / Monotributista",
    "Empresario",
    "Profesional independiente",
    "Jubilado / Pensionado",
    "Estudiante",
    "Otro",
  ],
  origenFondos: [
    "Sueldo",
    "Ahorros",
    "Venta de activos",
    "Herencia",
    "Inversiones",
    "Actividad comercial",
    "Otro",
  ],
  regimenesFiscales: [],
  textos: {
    notaRegulatoria: "Operamos bajo normativa BCRA.",
    normativaPld:
      "Estos datos son requeridos por normativa antilavado (UIF) y solo se comparten con las autoridades competentes.",
    normativaDocumentos:
      "Tus documentos se procesan en un entorno cifrado y se conservan según normativa BCRA y Ley 25.246.",
    pep: "Se consideran PEPs a los Funcionarios Públicos Nacionales, Provinciales y Municipales (tanto Nacionales como Extranjeros) de los Poderes Ejecutivo, Legislativo y Judicial, que ocupan o que ocuparon altos cargos jerárquicos, así como también a sus familiares hasta el segundo grado de consanguinidad. Los funcionarios calificados como PEPs continúan siéndolo hasta dos años después de haber cesado en sus funciones.",
  },
};

export const PAISES: Record<CodigoPais, ConfigPais> = { MX, AR };

const esCodigo = (c: unknown): c is CodigoPais => typeof c === "string" && c in PAISES;

/** País de la instalación según `brand.json` (México si falta o no se reconoce). */
export const PAIS_INSTALACION: CodigoPais = esCodigo(brandData.country) ? brandData.country : "MX";

let activo: ConfigPais = PAISES[PAIS_INSTALACION];

/** Configuración del país activo. */
export function getPais(): ConfigPais {
  return activo;
}

/** Cambia el país activo (tests, o un cliente de otro país en el futuro). */
export function setPaisActivo(codigo: CodigoPais): void {
  activo = PAISES[codigo];
}

/** Configuración de un país por código (`null` si no está soportado). */
export function paisPorCodigo(codigo: string | null | undefined): ConfigPais | null {
  return esCodigo(codigo) ? PAISES[codigo] : null;
}

/** Regímenes fiscales que aplican al tipo de persona. */
export function regimenesPara(pais: ConfigPais, persona: TipoPersona): RegimenFiscal[] {
  return pais.regimenesFiscales.filter((r) => r.persona === persona || r.persona === "ambas");
}
