// ============================================================================
// recipient-bdc.ts
// Recipient validation against the bank (BDC), falling back to the local mock.
//
// - BDC enabled (sandbox or homologacion): everything shown comes from the bank
//   via `GET /accounts/info/{CBU_CVU_ALIAS}` on our own backend. Only the format
//   (22 digits, etc.) is checked locally, and if the bank does not answer the error
//   is returned instead of inventing an account holder.
// - No backend (internal mode): the usual local validation.
//
// Used by the transfers screen and the recipients agenda so both hit the same place.
// ============================================================================

import {
  recipientValidator,
  detectIdentifierKind,
  isValidFormat,
  type IdentifierKind,
  type RecipientValidationResult,
} from "./recipient-validation";
import { createBdcClient, canQueryBdc, type BdcAccountInfoData } from "./bdc";

/** 11 digits → `20-00000000-01`. Anything else is returned unchanged. */
export function formatearCuit(cuit: string): string {
  const digitos = cuit.replace(/\D/g, "");
  return /^\d{11}$/.test(digitos)
    ? `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`
    : cuit;
}

/** Palabras que el banco usa en el tipo de cuenta. */
const TIPO_CUENTA_PALABRAS: Record<string, string> = {
  SAVING: "Caja de ahorro",
  CHECKING: "Cuenta corriente",
  ACCOUNT: "",
  WALLET: "Billetera virtual",
  CVU: "Billetera virtual",
  VIRTUAL: "",
  PAYMENT: "Cuenta de pago",
  CREDIT: "Cuenta de crédito",
};

const MONEDAS_TIPO = ["ARS", "USD", "EUR", "BRL"];

/**
 * `SAVING_ACCOUNT_ARS` → `Caja de ahorro (ARS)`.
 * Si el valor no se reconoce se devuelve tal cual (nunca se inventa).
 */
export function prettyTipoCuenta(raw?: string | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const partes = s.toUpperCase().split("_").filter(Boolean);
  const monedas = partes.filter((p) => MONEDAS_TIPO.includes(p));
  const palabras = [
    ...new Set(
      partes
        .filter((p) => !MONEDAS_TIPO.includes(p))
        .map((p) => TIPO_CUENTA_PALABRAS[p] ?? p.toLowerCase())
        .filter(Boolean),
    ),
  ];
  const base = palabras.join(" ");
  if (monedas.length) return `${base} (${monedas.join(", ")})`.trim();
  return base || s;
}

/** Código ISO numérico de moneda del banco → sigla (`032` → `ARS`). */
const MONEDAS_ISO: Record<string, string> = {
  "032": "ARS",
  "840": "USD",
  "978": "EUR",
  "986": "BRL",
};

export function prettyMoneda(raw?: string | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return MONEDAS_ISO[s] ?? MONEDAS_ISO[s.padStart(3, "0")] ?? s;
}

/** `isPhysicalPerson` → etiqueta legible. */
export function prettyTipoPersona(isPhysicalPerson?: boolean | null): string {
  if (isPhysicalPerson === true) return "Persona física";
  if (isPhysicalPerson === false) return "Persona jurídica";
  return "";
}

export async function validateRecipient(
  identifier: string,
  kind: IdentifierKind,
): Promise<RecipientValidationResult> {
  const raw = identifier.trim();
  const validatedAt = new Date().toISOString();
  const provider = canQueryBdc() ? "bdc" : "mock";

  // 1) Format: local check, does not depend on the bank.
  if (kind === "UNKNOWN" || !isValidFormat(kind, raw)) {
    return {
      status: "invalid_format",
      ok: false,
      kind,
      identifier: raw,
      provider,
      errorMessage: "Formato de CBU/CVU (22 dígitos) o Alias (6-20 caracteres) inválido",
      validatedAt,
    };
  }

  // 2) Internal mode: no bank connection.
  if (!canQueryBdc()) {
    return recipientValidator.validate({ identifier: raw, kind });
  }

  // 3) Real bank lookup.
  let info: { statusCode?: number; message?: string; data?: BdcAccountInfoData };
  try {
    info = await createBdcClient().infoCuenta(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "timeout",
      ok: false,
      kind,
      identifier: raw,
      provider,
      errorMessage: `No se pudo consultar al banco: ${msg}`,
      validatedAt,
    };
  }

  if (info?.statusCode !== 0) {
    return {
      status: "not_found",
      ok: false,
      kind,
      identifier: raw,
      provider,
      errorMessage: info?.message ?? `El banco devolvió error ${info.statusCode}`,
      validatedAt,
    };
  }

  const owner = info?.data?.owners?.[0];
  if (!owner) {
    return {
      status: "not_found",
      ok: false,
      kind,
      identifier: raw,
      provider,
      errorMessage: "El banco no devolvió titular para esa dirección",
      validatedAt,
    };
  }

  // The address returned by the bank wins; if it is not usable, the one that was
  // searched is used (the sandbox returns 000... in accountRouting).
  const dirBanco = String(info?.data?.accountRouting?.address ?? "");
  const cbu = /^\d{22}$/.test(dirBanco) && !/^0{22}$/.test(dirBanco) ? dirBanco : raw;

  return {
    status: "valid",
    ok: true,
    kind,
    identifier: raw,
    provider,
    raw: info,
    titular: {
      nombre: owner.displayName ?? raw,
      cuit: formatearCuit(owner.id ?? ""),
      cbu,
      alias: info?.data?.label ?? "",
      banco: info?.data?.entityRouting?.name ?? "",
      // Datos extra que manda el banco (se muestran como detalle del destinatario).
      bancoCodigo: info?.data?.entityRouting?.code ?? "",
      tipoCuenta: prettyTipoCuenta(info?.data?.type),
      moneda: prettyMoneda(info?.data?.currency),
      activa: info?.data?.isActive,
      tipoPersona: prettyTipoPersona(owner.isPhysicalPerson),
      tipoDoc: owner.idType ?? "",
    },
    validatedAt,
  };
}

export { detectIdentifierKind };
