// Cliente de la API de Ecart Pay para las Edge Functions (solo servidor: usa las claves privadas).
// Archivo compartido: idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
//
// - Token: POST /api/authorizations/token con Basic base64(public:private); dura 1 hora y se
//   reutiliza en memoria del isolate hasta 5 minutos antes de vencer.
// - Autorización: la referencia OpenAPI declara `bearer`, pero algunos ejemplos mandan el token
//   solo. Se prueba con "Bearer" y, si responde 401, se reintenta sin prefijo y se recuerda.
// - Montos: `payments[].amount` viene en centavos y `totals` en unidades (ver helpers).

export const ECARTPAY_URL = {
  sandbox: "https://sandbox.ecartpay.com",
  produccion: "https://ecartpay.com",
} as const;

export type Credenciales = { publicKey: string; privateKey: string };

/** Error de la API con el status y el cuerpo (sin credenciales) para diagnosticar. */
export class EcartPayError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly cuerpo?: unknown,
  ) {
    super(message);
  }
}

/** URL base según el entorno; `ECARTPAY_BASE_URL` la fuerza (p. ej. otro host de pruebas). */
export function baseUrlEcartPay(sandbox: boolean): string {
  const forzada = Deno.env.get("ECARTPAY_BASE_URL")?.trim();
  if (forzada) return forzada.replace(/\/+$/, "");
  return sandbox ? ECARTPAY_URL.sandbox : ECARTPAY_URL.produccion;
}

/** Claves de la cuenta de la plataforma (secretos del servidor), o null si faltan. */
export function credencialesPlataforma(): Credenciales | null {
  const publicKey = Deno.env.get("ECARTPAY_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("ECARTPAY_PRIVATE_KEY")?.trim();
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

export const centavosAUnidades = (centavos: number): number => Math.round(centavos) / 100;
export const unidadesACentavos = (unidades: number): number => Math.round(unidades * 100);

/** Vencimiento (ms) del JWT según su `exp`; si no se puede leer, una hora desde ahora. */
export function vencimientoToken(token: string, ahora = Date.now()): number {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof json.exp === "number") return json.exp * 1000;
  } catch {
    // token opaco: se usa la vigencia documentada
  }
  return ahora + 60 * 60 * 1000;
}

const MARGEN_MS = 5 * 60 * 1000;
type TokenCache = { token: string; vence: number };
const tokens = new Map<string, TokenCache>();
type ModoAuth = "bearer" | "plano";
let modoAuth: ModoAuth = "bearer";

type Opciones = {
  baseUrl: string;
  credenciales: Credenciales;
  /** Inyectable para tests. */
  fetch?: typeof fetch;
  /** Reintentos ante red caída, 429 o 5xx (solo GET). */
  reintentos?: number;
};

export type Solicitud = {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

export class EcartPayCliente {
  private readonly f: typeof fetch;
  private readonly reintentos: number;

  constructor(private readonly o: Opciones) {
    this.f = o.fetch ?? fetch;
    this.reintentos = o.reintentos ?? 2;
  }

  get baseUrl(): string {
    return this.o.baseUrl;
  }

  /** Modo de autorización que aceptó la API (para el diagnóstico). */
  get modoAutorizacion(): ModoAuth {
    return modoAuth;
  }

  private get claveCache(): string {
    return `${this.o.baseUrl}|${this.o.credenciales.publicKey}`;
  }

  /** Token vigente (de caché o nuevo). `renovar` descarta el de caché. */
  async token(renovar = false): Promise<string> {
    const c = tokens.get(this.claveCache);
    if (!renovar && c && c.vence - MARGEN_MS > Date.now()) return c.token;

    const { publicKey, privateKey } = this.o.credenciales;
    const res = await this.f(`${this.o.baseUrl}/api/authorizations/token`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${btoa(`${publicKey}:${privateKey}`)}`,
      },
    });
    const cuerpo = await leerCuerpo(res);
    if (!res.ok) {
      throw new EcartPayError(res.status, `No se pudo obtener el token (${res.status})`, cuerpo);
    }
    const token = (cuerpo as { token?: unknown } | null)?.token;
    if (typeof token !== "string" || !token) {
      throw new EcartPayError(502, "La respuesta del token no trae `token`", cuerpo);
    }
    tokens.set(this.claveCache, { token, vence: vencimientoToken(token) });
    return token;
  }

  async request<T = unknown>(metodo: string, ruta: string, s: Solicitud = {}): Promise<T> {
    const url = new URL(ruta, this.o.baseUrl);
    for (const [k, v] of Object.entries(s.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const idempotente = metodo.toUpperCase() === "GET";

    let token = await this.token();
    let probadoOtroModo = false;
    let renovado = false;
    for (let intento = 0; ; intento++) {
      let res: Response;
      try {
        res = await this.f(url, {
          method: metodo,
          headers: {
            accept: "application/json",
            ...(s.body !== undefined ? { "content-type": "application/json" } : {}),
            authorization: modoAuth === "bearer" ? `Bearer ${token}` : token,
          },
          body: s.body !== undefined ? JSON.stringify(s.body) : undefined,
        });
      } catch (e) {
        if (idempotente && intento < this.reintentos) {
          await esperar(intento);
          continue;
        }
        throw new EcartPayError(503, `Sin respuesta de Ecart Pay: ${(e as Error).message}`);
      }

      if (res.status === 401 && !(renovado && probadoOtroModo)) {
        await res.body?.cancel();
        if (!renovado) {
          renovado = true;
          token = await this.token(true);
        } else {
          probadoOtroModo = true;
          modoAuth = modoAuth === "bearer" ? "plano" : "bearer";
        }
        continue;
      }
      if (idempotente && (res.status === 429 || res.status >= 500) && intento < this.reintentos) {
        await res.body?.cancel();
        await esperar(intento);
        continue;
      }

      const cuerpo = await leerCuerpo(res);
      if (!res.ok) {
        throw new EcartPayError(res.status, mensajeError(cuerpo, res.status), cuerpo);
      }
      return cuerpo as T;
    }
  }

  get<T = unknown>(ruta: string, query?: Solicitud["query"]): Promise<T> {
    return this.request<T>("GET", ruta, { query });
  }

  post<T = unknown>(ruta: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", ruta, { body });
  }
}

async function leerCuerpo(res: Response): Promise<unknown> {
  const texto = await res.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto.slice(0, 500);
  }
}

function mensajeError(cuerpo: unknown, status: number): string {
  if (cuerpo && typeof cuerpo === "object") {
    const c = cuerpo as Record<string, unknown>;
    for (const k of ["message", "error", "detail"]) {
      if (typeof c[k] === "string" && c[k]) return c[k] as string;
    }
  }
  return `Ecart Pay respondió ${status}`;
}

const esperar = (intento: number) =>
  new Promise((r) => setTimeout(r, 300 * 2 ** intento + Math.random() * 100));

// ---------------------------------------------------------------------------------------------
// OAuth: el comercio conecta su cuenta (docs: /docs/oauth-ecart-pay)
// ---------------------------------------------------------------------------------------------

export type AppOAuth = { clientId: string; clientSecret: string };

/** Credenciales de la aplicación OAuth de la plataforma, o null si faltan. */
export function appOAuth(): AppOAuth | null {
  const clientId = Deno.env.get("ECARTPAY_OAUTH_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("ECARTPAY_OAUTH_CLIENT_SECRET")?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * URL de retorno registrada en la app OAuth (debe coincidir exactamente). Por defecto la Edge
 * Function `ecartpay-oauth-callback` del proyecto; `ECARTPAY_OAUTH_REDIRECT_URI` la fuerza.
 */
export function redirectUriOAuth(): string {
  const forzada = Deno.env.get("ECARTPAY_OAUTH_REDIRECT_URI")?.trim();
  if (forzada) return forzada;
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  return `${base}/functions/v1/ecartpay-oauth-callback`;
}

/** URL a la que se manda al comercio para iniciar sesión en Ecart Pay y aceptar. */
export function urlAutorizacionOAuth(
  baseUrl: string,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const u = new URL("/oauth", baseUrl);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

export type CredencialesComercio = {
  accountId: string;
  publicId: string;
  privateId: string;
  scopes: string[];
};

/**
 * Canjea el `code` (un solo uso, vence en 5 minutos) por las claves del comercio.
 * El code va en `Authorization` (sin "Bearer") y el secreto de la app en `x-secret`.
 */
export async function canjearCodigoOAuth(o: {
  baseUrl: string;
  app: AppOAuth;
  code: string;
  redirectUri: string;
  fetch?: typeof fetch;
}): Promise<CredencialesComercio> {
  const url = new URL("/api/oauth/token", o.baseUrl);
  url.searchParams.set("client_id", o.app.clientId);
  const res = await (o.fetch ?? fetch)(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: o.code,
      "x-secret": o.app.clientSecret,
    },
    body: JSON.stringify({ grant_type: "authorization_code", redirect_url: o.redirectUri }),
  });
  const cuerpo = await leerCuerpo(res);
  if (!res.ok) throw new EcartPayError(res.status, mensajeError(cuerpo, res.status), cuerpo);
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
  const cred = {
    accountId: str("account_id"),
    publicId: str("public_id"),
    privateId: str("private_id"),
    scopes: str("scope")
      .split(/[,\s]+/)
      .filter(Boolean),
  };
  if (!cred.publicId || !cred.privateId) {
    throw new EcartPayError(502, "La respuesta de OAuth no trae public_id y private_id");
  }
  return cred;
}

// ---------------------------------------------------------------------------------------------
// Órdenes (docs: /docs/orders). `totals` viene en unidades; `payments[].amount` en centavos.
// ---------------------------------------------------------------------------------------------

export type EstadoPago =
  | "creado"
  | "pendiente"
  | "pagado"
  | "rechazado"
  | "cancelado"
  | "reembolsado"
  | "parcialmente_reembolsado";

const POR_ESTADO_ORDEN: Record<string, EstadoPago> = {
  created: "creado",
  pending: "pendiente",
  processing: "pendiente",
  paid: "pagado",
  cancelled: "cancelado",
  canceled: "cancelado",
  refunded: "reembolsado",
  partially_refunded: "parcialmente_reembolsado",
};

const PAGO_FALLIDO = new Set(["declined", "failed", "rejected", "error", "denied"]);

export type ResumenOrden = {
  estado: EstadoPago;
  estadoProveedor: string;
  motivo: string | null;
  metodo: string | null;
  pagoId: string | null;
};

/**
 * Estado de JPay a partir de una orden de Ecart Pay. Si la orden sigue abierta pero el último
 * intento de pago falló, el pago se considera `rechazado` (el pagador puede reintentar en la
 * misma orden: un intento posterior aprobado la deja `paid`).
 */
export function resumirOrden(orden: unknown): ResumenOrden {
  const o = (orden ?? {}) as Record<string, unknown>;
  const estadoProveedor = typeof o.status === "string" ? o.status : "desconocido";
  let estado: EstadoPago = POR_ESTADO_ORDEN[estadoProveedor] ?? "pendiente";
  const pagos = Array.isArray(o.payments) ? (o.payments as Record<string, unknown>[]) : [];
  const ultimo = pagos.at(-1) ?? null;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const metodoObj = (ultimo?.method ?? null) as Record<string, unknown> | null;
  const metodo =
    texto(ultimo?.payment_method) ?? texto(metodoObj?.type) ?? texto(ultimo?.type) ?? null;
  let motivo: string | null = null;
  const estadoUltimo = texto(ultimo?.status)?.toLowerCase() ?? null;
  if (
    (estado === "creado" || estado === "pendiente") &&
    estadoUltimo &&
    PAGO_FALLIDO.has(estadoUltimo)
  ) {
    estado = "rechazado";
    motivo =
      texto(ultimo?.status_detail) ??
      texto(ultimo?.message) ??
      texto(ultimo?.error) ??
      texto(ultimo?.decline_reason) ??
      "El banco rechazó el pago";
  }
  return { estado, estadoProveedor, motivo, metodo, pagoId: texto(ultimo?.id) };
}

// ---------------------------------------------------------------------------------------------
// Webhooks (docs: /docs/webhook-authentication)
// Firma: x-pay-signature = "SHA256=" + hex(HMAC-SHA256(secret,
//   `${x-pay-timestamp}.${x-pay-webhook-id}.${JSON.stringify(body.data)}`))
// ---------------------------------------------------------------------------------------------

async function hmacHex(secreto: string, texto: string): Promise<string> {
  const enc = new TextEncoder();
  const clave = await crypto.subtle.importKey(
    "raw",
    enc.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, enc.encode(texto));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function igualesTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Verifica la firma de un webhook. La documentación firma `JSON.stringify(body.data)`, pero los
 * eventos de órdenes vienen planos (`{status, id}`): se aceptan las variantes razonables
 * (data, cuerpo completo, el literal "undefined" que produce JSON.stringify sin data).
 */
export async function verificarFirmaWebhook(o: {
  secreto: string;
  timestamp: string;
  webhookId: string;
  firma: string;
  cuerpo: unknown;
}): Promise<boolean> {
  const recibida = o.firma
    .replace(/^SHA256=/i, "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(recibida)) return false;
  const c = (o.cuerpo ?? {}) as Record<string, unknown>;
  const candidatos = new Set<string>();
  if ("data" in c) candidatos.add(JSON.stringify(c.data));
  candidatos.add(JSON.stringify(o.cuerpo));
  if (!("data" in c)) candidatos.add("undefined");
  for (const datos of candidatos) {
    const esperada = await hmacHex(o.secreto, `${o.timestamp}.${o.webhookId}.${datos}`);
    if (igualesTiempoConstante(esperada, recibida)) return true;
  }
  return false;
}

/** Evento e id de la orden (u objeto) a partir del cuerpo, venga plano o dentro de `data`. */
export function leerEventoWebhook(cuerpo: unknown): {
  evento: string | null;
  idExterno: string | null;
  estado: string | null;
} {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  const d = (c.data && typeof c.data === "object" ? c.data : c) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    evento: s(c.event) ?? s(c.type),
    idExterno: s(d.id) ?? s(d._id) ?? s(d.order_id),
    estado: s(d.status),
  };
}

/** Solo para tests: limpia la caché de tokens y el modo de autorización. */
export function _reiniciarEstado(): void {
  tokens.clear();
  modoAuth = "bearer";
}
