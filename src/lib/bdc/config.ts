/**
 * Frontend BDC configuration.
 *
 * The browser must NOT call Banco de Comercio directly nor hold clientSecret/SECRET_KEY.
 * The frontend only knows the backend URL (the platform backend), and that backend
 * decides the environment (`BDC_MODE` in its .env).
 */

export type BdcAccount = {
  /** 22-digit CBU or CVU. */
  address: string;
  /** Account holder CUIT, no dashes. */
  personId: string;
  addressType?: string;
  personIdType?: string;
};

export type BdcConfig = {
  /** Base URL of the backend proxy routes, e.g. http://localhost:3000/api/bdc */
  backendUrl: string;
};

export function readEnvVar(nombre: string): string | undefined {
  // NOTE: `import.meta.env` must appear literally in this file. If it is read as
  // `import.meta as {...}` and then `meta.env[name]`, Vite does not inject the env
  // object (nor inline it in the build) and the value is `undefined` in the browser.
  // That made `canQueryBdc()` return false and every recipient validation fell back
  // to the mock even when the backend was up.
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  const valor = env?.[nombre];
  return valor === undefined || valor === "" ? undefined : valor;
}

export function getBdcConfig(): BdcConfig {
  // URL base de las rutas BDC del backend, con su prefijo (p. ej. https://api.tu-dominio/api/bdc).
  // Sin valor por defecto: si no está configurada, el flujo BDC queda deshabilitado.
  const backendUrl = (readEnvVar("VITE_BDC_BACKEND_URL") ?? "").replace(/\/+$/, "");
  return { backendUrl };
}

export function canQueryBdc(cfg: BdcConfig = getBdcConfig()): boolean {
  return Boolean(cfg.backendUrl);
}

export function canTransferBdc(cfg: BdcConfig = getBdcConfig()): boolean {
  return Boolean(cfg.backendUrl);
}
