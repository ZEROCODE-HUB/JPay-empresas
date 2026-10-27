import type { CheckoutBandera, CheckoutLink } from "@/lib/api/checkout";
import { paymentMethods } from "@/data/links-pago";

export const LOTE_CATEGORY_TO_METHODS: Record<string, string[]> = {
  TARJETA_CREDITO: ["visa-cred", "mc-cred", "amex", "cabal-cred", "naranja", "diners"],
  TARJETA_DEBITO: ["visa-deb", "mc-deb", "cabal-deb", "maestro"],
  TRANSFERENCIA: ["transferencia"],
  QR: ["qr"],
};

export type MetodoCheckout = {
  id: string;
  label: string;
  category: "credit" | "debit" | "other";
  enabled: boolean;
};

export const EXTRA_METHODS: MetodoCheckout[] = [
  { id: "transferencia", label: "Transferencia", category: "other", enabled: true },
  { id: "qr", label: "Código QR", category: "other", enabled: true },
];

/**
 * Cada bandera del comercio puede habilitar mas de un metodo visible (Visa
 * credito y Visa debito, por ejemplo). Se usa para derivar que ids de metodo
 * mostrar a partir de las banderas activas y, al simular, para encontrar el
 * UUID de la bandera que corresponde al metodo elegido.
 */
const BANDERA_TO_METHODS: Record<string, string[]> = {
  visa: ["visa-cred", "visa-deb"],
  visa_débito: ["visa-deb"],
  visa_crédito: ["visa-cred"],
  visa_prepaga: ["visa-deb"],
  mastercard: ["mc-cred", "mc-deb"],
  mastercard_débito: ["mc-deb"],
  mastercard_crédito: ["mc-cred"],
  mastercard_prepaga: ["mc-deb"],
  amex: ["amex"],
  american_express: ["amex"],
  cabal: ["cabal-cred", "cabal-deb"],
  cabal_débito: ["cabal-deb"],
  cabal_crédito: ["cabal-cred"],
  naranja: ["naranja"],
  naranja_x: ["naranja"],
  diners: ["diners"],
  maestro: ["maestro"],
  transferencia: ["transferencia"],
  qr: ["qr"],
  pago_fácil: ["transferencia"],
  rapipago: ["transferencia"],
};

/** Bandera -> UN metodo visible (el primero de cada familia). */
const BANDERA_TO_METHOD: Record<string, string> = {
  visa: "visa-cred",
  visa_débito: "visa-deb",
  visa_crédito: "visa-cred",
  visa_prepaga: "visa-deb",
  mastercard: "mc-cred",
  mastercard_débito: "mc-deb",
  mastercard_crédito: "mc-cred",
  mastercard_prepaga: "mc-deb",
  amex: "amex",
  american_express: "amex",
  cabal: "cabal-cred",
  cabal_débito: "cabal-deb",
  cabal_crédito: "cabal-cred",
  naranja: "naranja",
  naranja_x: "naranja",
  diners: "diners",
  maestro: "maestro",
  transferencia: "transferencia",
  qr: "qr",
  pago_fácil: "transferencia",
  rapipago: "transferencia",
};

const CARD_METHODS = [
  "visa-cred",
  "mc-cred",
  "amex",
  "cabal-cred",
  "naranja",
  "diners",
  "visa-deb",
  "mc-deb",
  "cabal-deb",
  "maestro",
];

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function variantsDeBandera(flag: string): string[] {
  const lower = flag.toLowerCase();
  return BANDERA_TO_METHODS[lower] || BANDERA_TO_METHODS[lower.split("_")[0]] || [lower];
}

export function expandMethods(raw: string[] | null | undefined): string[] {
  if (!raw?.length) return [];
  const ids = raw.flatMap((m) => LOTE_CATEGORY_TO_METHODS[m] ?? (m ? [m] : []));
  return Array.from(new Set(ids));
}

export function getMethodIdFromBandera(bandera: string): string {
  const lower = bandera.toLowerCase();
  return BANDERA_TO_METHOD[lower] || BANDERA_TO_METHOD[lower.split("_")[0]] || lower;
}

export function isCardMethod(id: string) {
  return CARD_METHODS.includes(id);
}

/** Texto de la bandera -> clave normalizada ("Visa Débito" -> "visa_débito"). */
export function normalizarBandera(bandera: string): string {
  return bandera.toLowerCase().replace(/\s+/g, "_");
}

/** Total del link: suma del detalle si tiene productos; si no, el monto guardado. */
export function totalLink(d: Pick<CheckoutLink, "detalle" | "monto">): number {
  if (d.detalle?.length) {
    return d.detalle.reduce((a, p) => a + Number(p.precio_unitario) * Number(p.cantidad), 0);
  }
  return Number(d.monto ?? 0);
}

/** Metodo que se preselecciona al resolver el link. */
export function metodoInicial(
  comercioBanderas: string[],
  metodosPago: string[] | null | undefined,
): string {
  if (comercioBanderas.length > 0) return getMethodIdFromBandera(comercioBanderas[0]);
  const expanded = expandMethods(metodosPago);
  return (expanded[0] ?? metodosPago?.[0] ?? "").trim();
}

/**
 * Metodos que se muestran. Catálogo completo usado solo como diccionario
 * id -> label: nada se muestra sin que el comercio lo habilite. La única fuente
 * de verdad son las banderas activas del comercio del link (o el `metodos_pago`
 * que quedó guardado en el link). No hay fallback que vuelque el catálogo entero
 * ni métodos agregados de forma incondicional.
 *
 * Cada bandera del comercio corresponde a UN método visible: si el comercio
 * tiene 3 banderas (Visa, Mastercard, Amex) se muestran 3 botones, no 6 por la
 * expansión crédito/débito. Quien quiera débito por separado carga la bandera
 * "visa_débito" explícitamente.
 */
export function metodosDisponibles(
  comercioBanderas: string[],
  metodosPago: string[] | null | undefined,
): MetodoCheckout[] {
  const base: MetodoCheckout[] = [...paymentMethods, ...EXTRA_METHODS];
  const methodIds = new Set<string>();

  if (comercioBanderas.length > 0) {
    // El comercio se resolvió y tiene banderas activas: solo sus métodos.
    comercioBanderas.forEach((b) => {
      methodIds.add(getMethodIdFromBandera(b));
    });
  } else if (metodosPago?.length) {
    // Sin banderas resueltas (link sin comercio o lectura anónima limitada):
    // usar exactamente lo que guardó el link al crearse.
    metodosPago.forEach((m) => {
      if (LOTE_CATEGORY_TO_METHODS[m]) {
        LOTE_CATEGORY_TO_METHODS[m].forEach((v) => methodIds.add(v));
        return;
      }
      methodIds.add(getMethodIdFromBandera(m));
    });
  }

  return base.filter((m) => methodIds.has(m.id));
}

/**
 * Metodo elegido -> UUID de la fila `comercio_banderas` que lo representa.
 *
 * El backend resuelve el metodo_key y la bandera a partir de ese UUID; con
 * el texto del metodo ("visa-cred") el lookup falla cuando el comercio no
 * tiene ese metodo_key cargado. Si ninguna bandera cubre el metodo, devuelve
 * undefined y el backend cae al camino legacy con `method`.
 */
export function banderaIdDelMethod(
  banderasRows: CheckoutBandera[],
  methodId: string,
): string | undefined {
  if (!methodId) return undefined;
  return banderasRows.find((b) => variantsDeBandera(b.bandera).includes(methodId))?.id;
}

/** Digitos del PAN segun el metodo: Amex 15, Diners 14, el resto 16. */
export function cardDigitsMax(method: string): number {
  return method === "amex" ? 15 : method === "diners" ? 14 : 16;
}

export function cvvMax(method: string): number {
  return method === "amex" ? 4 : 3;
}

/** Formatea el numero de tarjeta: Amex en 4-6-5, el resto en grupos de 4. */
export function formatNro(v: string, method: string): string {
  const digits = v.replace(/\D/g, "").slice(0, cardDigitsMax(method));
  if (method === "amex") {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)]
      .filter(Boolean)
      .join(" ");
  }
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Formatea el vencimiento como "MM/AA" a medida que se tipea. */
export function formatVenc(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/**
 * El SDK lee mes y anio por separado desde el DOM, mientras que el formulario
 * muestra un unico "MM/AA". Se derivan del mismo estado para que no puedan
 * desincronizarse.
 */
export function vencPartes(venc: string): { mes: string; anio: string } {
  const digits = venc.replace(/\D/g, "");
  return { mes: digits.slice(0, 2), anio: digits.slice(2, 4) };
}

/** Monto tipeado (acepta coma decimal). Puede devolver NaN. */
export function parseMonto(montoPagar: string): number {
  return parseFloat(montoPagar.replace(",", "."));
}

/** true si el monto a pagar es invalido para el total del link. */
export function montoInvalido(mp: number, total: number): boolean {
  return mp <= 0 || mp > total + 0.001;
}

export type DatosPago = {
  method: string;
  titular: string;
  nro: string;
  venc: string;
  cvv: string;
  documento: string;
  email: string;
  montoPagar: string;
  /** Total del link, o null si todavia no se resolvio. */
  total: number | null;
};

/** Validacion previa a `paymentProcessor.process`. Devuelve el mensaje de error o null. */
export function validarPago(d: DatosPago): string | null {
  if (!d.method) return "Selecciona un metodo de pago";
  if (isCardMethod(d.method)) {
    if (!d.titular.trim()) return "Ingresa el titular de la tarjeta";
    if (d.nro.replace(/\s/g, "").length !== cardDigitsMax(d.method))
      return "Numero de tarjeta invalido";
    if (!/^\d{2}\/\d{2}$/.test(d.venc)) return "Vencimiento invalido (MM/AA)";
    if (d.cvv.length !== cvvMax(d.method)) return "CVV invalido";
    // La API de Payway exige la identificacion del titular: sin esto el token
    // no se genera y el error que vuelve no dice que falta este campo.
    if (d.documento.trim().length < 6) return "Ingresa el numero de documento del titular";
  }
  if (!EMAIL_RE.test(d.email)) return "Email invalido";
  const mp = parseMonto(d.montoPagar);
  if (d.total !== null && montoInvalido(mp, d.total)) return "Monto a pagar invalido";
  // No se exige comercio_id: el backend lo deriva del link. Validarlo aca solo
  // serviria para bloquear pagos validos si el anon-read fallara.
  return null;
}

/** Validacion de la simulacion: igual que `validarPago` sin los campos de tarjeta. */
export function validarSimulacion(
  d: Pick<DatosPago, "method" | "email" | "montoPagar" | "total">,
): string | null {
  if (!d.method) return "Selecciona un metodo de pago";
  if (!EMAIL_RE.test(d.email)) return "Email invalido";
  const mp = parseMonto(d.montoPagar);
  if (d.total !== null && montoInvalido(mp, d.total)) return "Monto a pagar invalido";
  return null;
}
