/**
 * Datos del alta de un comercio en Cobre como Subcliente (KYB, "onboarding FBO" del Solution
 * Design de JPAY): catálogo de industrias del OAS, países (ISO alfa-3) y validaciones de los
 * representantes legales y beneficiarios finales.
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 */
import { validarCurp, validarRfc } from "./validadores";

/** Industrias que acepta `POST /subclients` (`industry`). Las más comunes con etiqueta en español. */
const ETIQUETAS_INDUSTRIA: Record<string, string> = {
  internet_marketplace: "Marketplace en internet",
  online_mail_order_retail: "Comercio electrónico / venta a distancia",
  food_beverage_services: "Restaurantes y servicios de comida",
  food_beverage_retail: "Venta de alimentos y bebidas",
  retail_apparel_fashion: "Venta de ropa y moda",
  retail_appliances_electronics: "Venta de electrónica y electrodomésticos",
  retail_health_personal_care: "Venta de salud y cuidado personal",
  beauty_personal_care: "Belleza y cuidado personal",
  hospitality: "Hotelería y alojamiento",
  travel_arrangements: "Agencias de viaje",
  software_development: "Desarrollo de software",
  it_services_consulting: "Servicios y consultoría de TI",
  business_consulting: "Consultoría de negocios",
  marketing_services: "Servicios de marketing",
  legal_services: "Servicios legales",
  accounting: "Contabilidad",
  e_learning: "Educación en línea",
  higher_education: "Educación superior",
  primary_secondary_education: "Educación básica y media",
  hospitals: "Hospitales y clínicas",
  pharmaceutical: "Farmacéutica",
  freight_package_transportation: "Fletes y paquetería",
  ground_passenger_transportation: "Transporte de pasajeros",
  leasing_real_estate: "Arrendamiento e inmobiliaria",
  building_construction: "Construcción",
  wholesale_import_export: "Mayoreo, importación y exportación",
  events_services: "Organización de eventos",
  non_profit_organizations: "Organizaciones sin fines de lucro",
  domestic_psp: "Proveedor de pagos nacional (PSP)",
  wallet: "Billetera digital",
  remittances: "Remesas",
};

const INDUSTRIAS_OAS = [
  "accounting",
  "capital_markets",
  "credit_intermediation",
  "crypto_wallet",
  "debt_fund",
  "domestic_psp",
  "domestic_psp_crypto",
  "energy_sector",
  "facilities_services",
  "factoring_confirming",
  "fiduciaries",
  "funds_trusts",
  "gambling_casinos",
  "holding_companies",
  "international_psp",
  "international_psp_crypto",
  "internet_marketplace",
  "investment_banking",
  "maritime_transportation",
  "microloans",
  "non_otc_desks",
  "non_profit_organizations",
  "oil_gas",
  "online_sports_betting",
  "otc_desks",
  "remittances",
  "retail_motor_vehicles",
  "secured_lending",
  "travel_arrangements",
  "wallet",
  "wholesale_import_export",
  "wholesale_motor_vehicles_parts",
  "building_construction",
  "retail_building_materials_garden",
  "airlines_aviation",
  "apparel_manufacturing",
  "mobility_services",
  "banks",
  "beauty_personal_care",
  "broadcast_media",
  "business_consulting",
  "business_skills_training",
  "correspondent_banking",
  "design_services",
  "desktop_computing_software",
  "e_learning",
  "employees_fund",
  "equipment_rental",
  "events_services",
  "fabricated_metal_products",
  "farming",
  "food_beverage_retail",
  "food_beverage_services",
  "freight_package_transportation",
  "furniture_manufacturing",
  "ground_passenger_transportation",
  "higher_education",
  "hospitality",
  "hospitals",
  "household_services",
  "insurance",
  "it_services_consulting",
  "legal_services",
  "leasing_real_estate",
  "marketing_services",
  "medical_equipment_manufacturing",
  "musicians",
  "office_administration",
  "online_mail_order_retail",
  "parking_services",
  "pension_funds",
  "pharmaceutical",
  "pipeline_transportation",
  "plastics_rubber_manufacturing",
  "primary_secondary_education",
  "rail_transportation",
  "recreational_facilities",
  "repair_maintenance",
  "research_services",
  "retail_apparel_fashion",
  "retail_appliances_electronics",
  "retail_art_supplies",
  "retail_florists",
  "retail_health_personal_care",
  "retail_office_equipment",
  "retail_office_supplies_gifts",
  "software_development",
  "software_factory",
  "staffing_recruiting",
  "technology_information_media",
  "telephone_call_centers",
  "transportation_equipment_manufacturing",
  "truck_transportation",
  "warehousing_storage",
  "water_waste_steam_ac",
  "wholesale_alcoholic_beverages",
  "wholesale_apparel_sewing",
  "wholesale_appliances_electronics",
  "wholesale_computer_equipment",
  "wholesale_food_beverage",
  "wholesale_machinery",
  "wholesale_metals_minerals",
  "wholesale_paper_products",
  "wholesale_raw_farm_products",
  "currency_exchange",
  "gold_precious_metals_extraction",
  "jewelry_precious_metals",
  "pawn_shops",
  "wholesale_waste_scrap_junk",
];

export const etiquetaIndustria = (v: string) =>
  ETIQUETAS_INDUSTRIA[v] ?? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Industrias ordenadas: primero las comunes (en español), después el resto del catálogo. */
export const INDUSTRIAS_COBRE: { value: string; label: string }[] = [
  ...Object.keys(ETIQUETAS_INDUSTRIA).map((v) => ({ value: v, label: ETIQUETAS_INDUSTRIA[v] })),
  ...INDUSTRIAS_OAS.filter((v) => !ETIQUETAS_INDUSTRIA[v])
    .map((v) => ({ value: v, label: etiquetaIndustria(v) }))
    .sort((a, b) => a.label.localeCompare(b.label)),
];

/** Países ISO 3166-1 alfa-3 para nacionalidades, constitución y beneficiarios. */
export const PAISES_ISO3: { value: string; label: string }[] = [
  { value: "MEX", label: "México" },
  { value: "USA", label: "Estados Unidos" },
  { value: "ARG", label: "Argentina" },
  { value: "BOL", label: "Bolivia" },
  { value: "BRA", label: "Brasil" },
  { value: "CAN", label: "Canadá" },
  { value: "CHL", label: "Chile" },
  { value: "CHN", label: "China" },
  { value: "COL", label: "Colombia" },
  { value: "CRI", label: "Costa Rica" },
  { value: "CUB", label: "Cuba" },
  { value: "DEU", label: "Alemania" },
  { value: "DOM", label: "República Dominicana" },
  { value: "ECU", label: "Ecuador" },
  { value: "ESP", label: "España" },
  { value: "FRA", label: "Francia" },
  { value: "GBR", label: "Reino Unido" },
  { value: "GTM", label: "Guatemala" },
  { value: "HND", label: "Honduras" },
  { value: "ITA", label: "Italia" },
  { value: "JPN", label: "Japón" },
  { value: "NIC", label: "Nicaragua" },
  { value: "PAN", label: "Panamá" },
  { value: "PER", label: "Perú" },
  { value: "PRY", label: "Paraguay" },
  { value: "SLV", label: "El Salvador" },
  { value: "URY", label: "Uruguay" },
  { value: "VEN", label: "Venezuela" },
];

export const nombrePais = (iso3: string) =>
  PAISES_ISO3.find((p) => p.value === iso3)?.label ?? iso3;

export type RolKyb = "representante" | "beneficiario";

/** Topes de Cobre para el alta en México: 20 representantes y 4 beneficiarios (25% o más). */
export const MAX_PERSONAS_KYB: Record<RolKyb, number> = { representante: 20, beneficiario: 4 };

export type PersonaKyb = {
  id?: string;
  rol: RolKyb;
  nombre: string;
  apellido: string;
  idTipo: "rfc" | "curp";
  idNumero: string;
  nacionalidades: string[];
  fechaNacimiento: string;
  /** Participación (beneficiarios: en México, 25% o más). */
  porcentaje: number | null;
};

/** Valida una persona del KYB; devuelve el error o null. */
export function validarPersonaKyb(p: PersonaKyb): string | null {
  if (!p.nombre.trim() || !p.apellido.trim()) return "Falta el nombre o el apellido";
  const id = p.idNumero.trim().toUpperCase();
  const err = p.idTipo === "curp" ? validarCurp(id) : validarRfc(id);
  if (err) return err;
  if (!p.nacionalidades.length) return "Elegí al menos una nacionalidad";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fechaNacimiento)) return "Falta la fecha de nacimiento";
  const edad = (Date.now() - Date.parse(p.fechaNacimiento)) / (365.25 * 86_400_000);
  if (!(edad >= 18 && edad < 120)) return "La persona debe ser mayor de edad";
  if (
    p.rol === "beneficiario" &&
    p.porcentaje != null &&
    (p.porcentaje < 25 || p.porcentaje > 100)
  ) {
    return "En México se declaran los beneficiarios con 25% o más de participación";
  }
  return null;
}

/** Normaliza un sitio web (agrega https:// si falta); null si no parece una URL. */
export function normalizarSitioWeb(v: string): string | null {
  const x = v.trim();
  if (!x) return null;
  const url = /^https?:\/\//i.test(x) ? x : `https://${x}`;
  return /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(url) ? url : null;
}
