/**
 * Validadores de identificadores por país (fiscales, personales y bancarios).
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 * Cada validador recibe el valor como lo escribe el usuario (con espacios, guiones o minúsculas)
 * y devuelve `null` si es válido o el mensaje de error para mostrar.
 */

export type Validador = (valor: string) => string | null;

/** Quita espacios y guiones y pasa a mayúsculas. */
export const normalizarId = (v: string) => v.replace(/[\s-]/g, "").toUpperCase();

const soloDigitos = (v: string) => v.replace(/\D/g, "");

/** "AAMMDD" válido (año de 2 dígitos, cualquier siglo). */
function fechaAammddValida(s: string): boolean {
  const mes = Number(s.slice(2, 4));
  const dia = Number(s.slice(4, 6));
  if (mes < 1 || mes > 12 || dia < 1) return false;
  // 2000 es bisiesto: acepta 29/02 en cualquier año divisible por 4 de 2 dígitos.
  const d = new Date(2000 + Number(s.slice(0, 2)), mes, 0).getDate();
  return dia <= d;
}

// ── México ──────────────────────────────────────────────────────────────────

const RFC_DICCIONARIO = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ";
/**
 * RFC genéricos del SAT (público en general y extranjeros) y el de pruebas de CFDI: no llevan
 * dígito verificador real.
 */
const RFC_GENERICOS = new Set(["XAXX010101000", "XEXX010101000", "AAA010101AAA"]);

/** Dígito verificador del RFC (algoritmo del SAT, sobre los primeros 11 o 12 caracteres). */
export function digitoRfc(rfc: string): string {
  const base = (rfc.length === 12 ? " " + rfc : rfc).slice(0, 12);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Math.max(0, RFC_DICCIONARIO.indexOf(base[i])) * (13 - i);
  const resto = suma % 11;
  if (resto === 0) return "0";
  return 11 - resto === 10 ? "A" : String(11 - resto);
}

/**
 * RFC de persona física (13 caracteres) o moral (12). `persona` restringe el largo.
 */
export function validarRfc(valor: string, persona?: "fisica" | "moral"): string | null {
  const rfc = normalizarId(valor);
  if (!rfc) return "Requerido";
  if (RFC_GENERICOS.has(rfc)) return null;
  const largo = persona === "fisica" ? 13 : persona === "moral" ? 12 : null;
  if (largo && rfc.length !== largo) {
    return `El RFC de persona ${persona === "fisica" ? "física" : "moral"} tiene ${largo} caracteres.`;
  }
  const m = /^([A-ZÑ&]{3,4})(\d{6})([A-Z\d]{2})([A\d])$/.exec(rfc);
  if (!m) return "Formato de RFC inválido.";
  if (!fechaAammddValida(m[2])) return "La fecha del RFC no es válida.";
  if (digitoRfc(rfc) !== m[4]) return "El dígito verificador del RFC no coincide.";
  return null;
}

const CURP_DICCIONARIO = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const CURP_ESTADOS = new Set(
  "AS BC BS CC CL CM CS CH DF DG GT GR HG JC MC MN MS NT NL OC PL QT QR SP SL SR TC TS TL VZ YN ZS NE".split(
    " ",
  ),
);

/** Dígito verificador de la CURP (posición 18). */
export function digitoCurp(curp: string): string {
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += Math.max(0, CURP_DICCIONARIO.indexOf(curp[i])) * (18 - i);
  return String((10 - (suma % 10)) % 10);
}

/** CURP (18 caracteres) con fecha, sexo, entidad y dígito verificador. */
export function validarCurp(valor: string): string | null {
  const curp = normalizarId(valor);
  if (!curp) return "Requerido";
  if (curp.length !== 18) return "La CURP tiene 18 caracteres.";
  const m = /^[A-Z][AEIOUX][A-Z]{2}(\d{6})[HMX]([A-Z]{2})[B-DF-HJ-NP-TV-Z]{3}[A-Z\d](\d)$/.exec(
    curp,
  );
  if (!m) return "Formato de CURP inválido.";
  if (!fechaAammddValida(m[1])) return "La fecha de la CURP no es válida.";
  if (!CURP_ESTADOS.has(m[2])) return "La entidad de nacimiento de la CURP no es válida.";
  if (digitoCurp(curp) !== m[3]) return "El dígito verificador de la CURP no coincide.";
  return null;
}

/** Dígito de control de la CLABE (pesos 3, 7, 1 sobre los primeros 17 dígitos). */
export function digitoClabe(clabe: string): string {
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(clabe[i]) * pesos[i % 3]) % 10;
  return String((10 - (suma % 10)) % 10);
}

/** CLABE interbancaria (18 dígitos) con dígito de control. */
export function validarClabe(valor: string): string | null {
  const clabe = soloDigitos(valor);
  if (!clabe) return "Requerido";
  if (clabe.length !== 18 || clabe.length !== valor.replace(/\s/g, "").length) {
    return "La CLABE tiene 18 dígitos.";
  }
  if (digitoClabe(clabe) !== clabe[17]) return "El dígito de control de la CLABE no coincide.";
  return null;
}

// ── Argentina ───────────────────────────────────────────────────────────────

/** Dígito verificador de CUIT/CUIL (módulo 11). `null` si el número no tiene dígito posible. */
export function digitoCuit(cuit: string): string | null {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(cuit[i]), 0);
  const d = 11 - (suma % 11);
  if (d === 11) return "0";
  return d === 10 ? null : String(d);
}

/** CUIT/CUIL (11 dígitos) con dígito verificador. */
export function validarCuit(valor: string): string | null {
  const cuit = soloDigitos(valor);
  if (!cuit) return "Requerido";
  if (cuit.length !== 11) return "El CUIT tiene 11 dígitos.";
  if (digitoCuit(cuit) !== cuit[10]) return "El dígito verificador del CUIT no coincide.";
  return null;
}

/** CBU/CVU (22 dígitos) con sus dos dígitos verificadores. */
export function validarCbu(valor: string): string | null {
  const cbu = soloDigitos(valor);
  if (!cbu) return "Requerido";
  if (cbu.length !== 22) return "El CBU tiene 22 dígitos.";
  const control = (bloque: string, pesos: number[]) =>
    String((10 - (pesos.reduce((s, p, i) => s + p * Number(bloque[i]), 0) % 10)) % 10);
  const b1 = control(cbu.slice(0, 7), [7, 1, 3, 9, 7, 1, 3]);
  const b2 = control(cbu.slice(8, 21), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);
  if (b1 !== cbu[7] || b2 !== cbu[21]) return "Los dígitos verificadores del CBU no coinciden.";
  return null;
}
