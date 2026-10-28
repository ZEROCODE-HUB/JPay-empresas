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

/** Solo para tests: limpia la caché de tokens y el modo de autorización. */
export function _reiniciarEstado(): void {
  tokens.clear();
  modoAuth = "bearer";
}
