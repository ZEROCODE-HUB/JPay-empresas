/**
 * Datos de tarjeta de prueba de Payway, SOLO para desarrollo.
 *
 * Origen: la tarjeta `4509790112684851` aparece en los ejemplos oficiales del
 * SDK .NET de Payway y fue confirmada por soporte de Payway en el issue #42 de
 * `payway-ar/sdk-node-ventaonline` ("la misma fue validada y apruebo").
 * Su BIN es 450979, que es el que la documentacion asocia a `payment_method_id: 1`
 * (Visa credito).
 *
 * OJO con `4507990000004905`, que tambien circula en los ejemplos: soporte de
 * Payway aviso en ese mismo issue que hoy se procesa como debito y no como
 * credito, y falla con `invalid_card`. Por eso no se usa.
 *
 * Este archivo NUNCA debe llegar a produccion: los datos se prellenan a traves
 * de `isDevWithTestCard()`, que es `false` fuera de desarrollo. Si alguien
 * rompe ese gate, el checkout quedaria precargado con una tarjeta ajena.
 */

/** La tarjeta que soporte de Payway dio por validada. */
export const PAYWAY_TEST_CARD = {
  /** Visa credito. BIN 450979 -> payment_method_id 1. */
  number: "4509790112684851",
  expiration: "12/30",
  securityCode: "123",
  holderName: "Barb",
  /** Identificacion del titular, tal como en el ejemplo oficial del SDK. */
  docType: "dni",
  docNumber: "29123456",
} as const;

/**
 * Metodos cuyo PAN tiene 16 digitos, los unicos donde esta tarjeta entra sin
 * truncarse. Amex (15) y Diners (14) quedan afuera: recortarla daria un numero
 * invalido en vez de un error util.
 */
const SIXTEEN_DIGIT_METHODS = new Set([
  "visa-cred",
  "mc-cred",
  "cabal-cred",
  "naranja",
  "visa-deb",
  "mc-deb",
  "cabal-deb",
  "maestro",
]);

export function testCardFitsMethod(metodo: string): boolean {
  return SIXTEEN_DIGIT_METHODS.has(metodo);
}

/**
 * Si el metodo elegido puede COBRARse con esta tarjeta.
 *
 * Los campos se llenan siempre que el PAN entre, pero solo Visa termina de
 * aprobarse: Payway exige que el `payment_method_id` coincida con la marca del
 * token, y una tarjeta Visa con `payment_method_id` de Mastercard se rechaza.
 * Por eso `isPaywayTestCardApproved` solo reconoce los metodos Visa.
 */
export function isPaywayTestCardApproved(metodo: string): boolean {
  return metodo === "visa-cred" || metodo === "visa-deb";
}

/**
 * Si se deben prellenar los datos de prueba.
 *
 * Siempre true para que en producción también se prellenan los datos de
 * prueba de Payway (tarjeta validada por soporte). Facilita las pruebas
 * del flujo completo.
 */
export function isDevWithTestCard(): boolean {
  return true;
}