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
// Pagos fuera del checkout: SPEI (CLABE única por orden) y OXXO (referencia en tienda).
// `POST /api/orders/{id}/process` con el method_id genera la referencia; se lee de la orden
// pública (`GET /api/orders/public/{id}` → payments[]). Docs: unique-transaction-clabe, oxxo-pay.
// ---------------------------------------------------------------------------------------------

export const METODOS_EXTERNOS = {
  spei: { methodId: "66c397dafd263a538b8312a1", tipo: "transfer", tope: null },
  oxxo: { methodId: "63c5dcfb9a645c3e3265ba42", tipo: "cash", tope: 11_000 },
} as const;
export type MetodoExterno = keyof typeof METODOS_EXTERNOS;

export type ReferenciaPago = {
  referencia: string;
  venceAt: string | null;
  url: string | null;
  monto: number | null;
};

/** Referencia del último pago del tipo pedido (CLABE o referencia OXXO), o null. */
export function leerReferenciaPago(orden: unknown, metodo: MetodoExterno): ReferenciaPago | null {
  const o = (orden ?? {}) as Record<string, unknown>;
  const pagos = Array.isArray(o.payments) ? (o.payments as Record<string, unknown>[]) : [];
  const tipo = METODOS_EXTERNOS[metodo].tipo;
  const p = [...pagos].reverse().find((x) => x?.type === tipo);
  if (!p) return null;
  const m = (p.method ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const referencia = s(m.reference) ?? (metodo === "spei" ? s(p.id) : null);
  if (!referencia) return null;
  return {
    referencia,
    venceAt: s(m.expires_at),
    url: s(m.barcode_url),
    monto: typeof p.amount === "number" ? centavosAUnidades(p.amount) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Puntos físicos (docs: branch-management, sales-register-management, terminal-pos-management).
// Sucursal → Caja → Terminal. Las respuestas traen el objeto en `data` y los listados en
// `data[]` con `pagination`.
// ---------------------------------------------------------------------------------------------

const ESTADO_A_ECART: Record<string, string> = {
  activa: "active",
  inactiva: "inactive",
  pausada: "paused",
  mantenimiento: "maintenance",
};
const ESTADO_DE_ECART: Record<string, string> = Object.fromEntries(
  Object.entries(ESTADO_A_ECART).map(([k, v]) => [v, k]),
);

export type SucursalLocal = {
  nombre: string;
  calle?: string | null;
  ciudad?: string | null;
  estado_region?: string | null;
  codigo_postal?: string | null;
  telefono?: string | null;
  email?: string | null;
  encargado?: string | null;
  horario?: Record<string, unknown> | null;
  timezone?: string | null;
  estado?: string | null;
};

const sinVacios = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );

/** Cuerpo para POST/PUT /api/pos/branches. */
export function sucursalAEcart(s: SucursalLocal, idLocal?: string): Record<string, unknown> {
  const address = sinVacios({
    street: s.calle,
    city: s.ciudad,
    state: s.estado_region,
    postal_code: s.codigo_postal,
    country: "Mexico",
  });
  const contact = sinVacios({ email: s.email, phone: s.telefono, manager_name: s.encargado });
  return sinVacios({
    name: s.nombre,
    external_id: idLocal,
    address,
    contact: Object.keys(contact).length ? contact : undefined,
    operating_hours: s.horario && Object.keys(s.horario).length ? s.horario : undefined,
    timezone: s.timezone,
    status: s.estado ? ESTADO_A_ECART[s.estado] : undefined,
  });
}

/** Campos locales a partir de una sucursal de Ecart Pay. */
export function sucursalDeEcart(
  b: Record<string, unknown>,
): SucursalLocal & { id_externo: string } {
  const a = (b.address ?? {}) as Record<string, unknown>;
  const c = (b.contact ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id_externo: String(b._id ?? b.id ?? ""),
    nombre: s(b.name) ?? "Sucursal",
    calle: s(a.street),
    ciudad: s(a.city),
    estado_region: s(a.state),
    codigo_postal: s(a.postal_code),
    telefono: s(c.phone),
    email: s(c.email),
    encargado: s(c.manager_name),
    horario:
      b.operating_hours && typeof b.operating_hours === "object"
        ? (b.operating_hours as Record<string, unknown>)
        : {},
    timezone: s(b.timezone) ?? "America/Mexico_City",
    estado: ESTADO_DE_ECART[s(b.status) ?? ""] ?? "activa",
  };
}

export type CajaLocal = {
  nombre: string;
  numero: string;
  estado?: string | null;
  permite_reembolsos?: boolean;
  tope_reembolso?: number | null;
  requiere_aprobacion?: boolean;
  umbral_aprobacion?: number | null;
  copias_ticket?: number;
};

/** Cuerpo para POST/PUT /api/pos/sales-registers. */
export function cajaAEcart(
  c: CajaLocal,
  sucursalExterna: string,
  idLocal?: string,
): Record<string, unknown> {
  return sinVacios({
    pos_branches_id: sucursalExterna,
    name: c.nombre,
    register_number: c.numero,
    external_id: idLocal,
    status: c.estado ? ESTADO_A_ECART[c.estado] : undefined,
    settings: sinVacios({
      allow_refunds: c.permite_reembolsos,
      max_refund_amount: c.tope_reembolso,
      require_manager_approval: c.requiere_aprobacion,
      manager_approval_threshold: c.umbral_aprobacion,
      receipt_copies: c.copias_ticket,
    }),
  });
}

/** Campos locales a partir de una caja de Ecart Pay (y el id externo de su sucursal). */
export function cajaDeEcart(r: Record<string, unknown>): CajaLocal & {
  id_externo: string;
  sucursal_externa: string | null;
  terminal_externa: string | null;
} {
  const st = (r.settings ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  // Números que pueden venir como texto; si el ajuste no viene, queda undefined y la
  // sincronización no pisa el valor guardado en JPay.
  const n = (v: unknown) => {
    const x = typeof v === "string" && v.trim() ? Number(v) : v;
    return typeof x === "number" && Number.isFinite(x) ? x : undefined;
  };
  const b = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const ref = (v: unknown) =>
    s(v) ?? (v && typeof v === "object" ? s((v as Record<string, unknown>)._id) : null);
  return {
    id_externo: String(r._id ?? r.id ?? ""),
    sucursal_externa: ref(r.pos_branches_id) ?? ref(r.branch),
    terminal_externa: ref(r.pos_information_id) ?? ref(r.terminal),
    nombre: s(r.name) ?? "Caja",
    numero: s(r.register_number) ?? String(r.register_number ?? ""),
    estado: ESTADO_DE_ECART[s(r.status) ?? ""] ?? "activa",
    permite_reembolsos: b(st.allow_refunds),
    tope_reembolso: n(st.max_refund_amount),
    requiere_aprobacion: b(st.require_manager_approval),
    umbral_aprobacion: n(st.manager_approval_threshold),
    copias_ticket: n(st.receipt_copies),
  };
}

/** Campos locales de una terminal de Ecart Pay (GET /api/pos/terminals/point-of-sale). */
export function terminalDeEcart(t: Record<string, unknown>) {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const caja = (t.sales_register ?? null) as Record<string, unknown> | null;
  return {
    id_externo: String(t._id ?? t.id ?? ""),
    serie: s(t.serial_number),
    modo: s(t.operating_mode),
    es_punto_venta: t.is_point_of_sale === true,
    estado: s(t.status),
    caja_externa: caja ? (s(caja._id) ?? s(caja.id)) : null,
  };
}

/** Lista de un endpoint paginado (`data[]` + `pagination`), todas las páginas. */
export async function listarTodo(
  cliente: EcartPayCliente,
  ruta: string,
  query: Record<string, string | number | undefined> = {},
): Promise<Record<string, unknown>[]> {
  const todo: Record<string, unknown>[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await cliente.get<{ data?: unknown; pagination?: { pages?: number } }>(ruta, {
      ...query,
      page,
      limit: 100,
    });
    const datos = Array.isArray(r?.data) ? (r.data as Record<string, unknown>[]) : [];
    todo.push(...datos);
    const paginas = r?.pagination?.pages ?? 1;
    if (page >= paginas || datos.length === 0) break;
  }
  return todo;
}

// ---------------------------------------------------------------------------------------------
// Conciliación (docs: /docs/summaries). GET /api/transactions: `type: "payment"` trae el
// `order_id`, `total` (bruto), `fee` y `amount` (neto); los reembolsos son `type: "charge"`.
// ---------------------------------------------------------------------------------------------

export type TransaccionPago = {
  id: string;
  ordenId: string;
  estado: string;
  total: number;
  comision: number | null;
  neto: number | null;
};

/** Transacciones de pago (con orden) del listado de Ecart Pay. */
export function transaccionesDePago(docs: unknown[]): TransaccionPago[] {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return docs
    .map((d) => (d ?? {}) as Record<string, unknown>)
    .filter((d) => d.type === "payment" && typeof d.order_id === "string")
    .map((d) => ({
      id: String(d.id ?? d.transaction_id ?? ""),
      ordenId: d.order_id as string,
      estado: typeof d.status === "string" ? d.status : "desconocido",
      total: num(d.total) ?? num(d.amount) ?? 0,
      comision: num(d.fee),
      neto: num(d.amount),
    }));
}

export type PagoAConciliar = {
  id: string;
  ordenId: string | null;
  estado: string;
  monto: number;
};

export type Diferencia = {
  tipo: "falta_en_jpay" | "falta_en_proveedor" | "monto_distinto" | "estado_distinto";
  pagoId: string | null;
  ordenId: string | null;
  transaccionId: string | null;
  detalle: Record<string, unknown>;
};

const ESTADOS_COBRADOS = new Set(["pagado", "reembolsado", "parcialmente_reembolsado"]);
const TX_COBRADA = new Set(["paid", "refunded", "partially_refunded"]);

/**
 * Compara transacciones del proveedor con los pagos de JPay del mismo período. Devuelve las
 * diferencias y, para cada pago encontrado, la transacción (para guardar comisión y neto).
 */
export function conciliar(
  txs: TransaccionPago[],
  pagos: PagoAConciliar[],
): { diferencias: Diferencia[]; coincidencias: { pagoId: string; tx: TransaccionPago }[] } {
  const porOrden = new Map(pagos.filter((p) => p.ordenId).map((p) => [p.ordenId as string, p]));
  const vistas = new Set<string>();
  const diferencias: Diferencia[] = [];
  const coincidencias: { pagoId: string; tx: TransaccionPago }[] = [];

  for (const tx of txs) {
    const p = porOrden.get(tx.ordenId);
    if (!p) {
      if (TX_COBRADA.has(tx.estado)) {
        diferencias.push({
          tipo: "falta_en_jpay",
          pagoId: null,
          ordenId: tx.ordenId,
          transaccionId: tx.id,
          detalle: { estado_proveedor: tx.estado, total: tx.total },
        });
      }
      continue;
    }
    vistas.add(p.id);
    coincidencias.push({ pagoId: p.id, tx });
    if (Math.abs(tx.total - p.monto) > 0.005) {
      diferencias.push({
        tipo: "monto_distinto",
        pagoId: p.id,
        ordenId: tx.ordenId,
        transaccionId: tx.id,
        detalle: { monto_jpay: p.monto, total_proveedor: tx.total },
      });
    }
    if (TX_COBRADA.has(tx.estado) !== ESTADOS_COBRADOS.has(p.estado)) {
      diferencias.push({
        tipo: "estado_distinto",
        pagoId: p.id,
        ordenId: tx.ordenId,
        transaccionId: tx.id,
        detalle: { estado_jpay: p.estado, estado_proveedor: tx.estado },
      });
    }
  }
  for (const p of pagos) {
    if (!vistas.has(p.id) && ESTADOS_COBRADOS.has(p.estado)) {
      diferencias.push({
        tipo: "falta_en_proveedor",
        pagoId: p.id,
        ordenId: p.ordenId,
        transaccionId: null,
        detalle: { estado_jpay: p.estado, monto_jpay: p.monto },
      });
    }
  }
  return { diferencias, coincidencias };
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

// ---------------------------------------------------------------------------------------------
// Meses sin intereses y cuotas fijas (docs: /docs/interest-free-and-fixed-installments). Solo MXN.
// `GET|POST /api/cards/msi-configuration`: `commissions[]` con `installments` (3, 6, 9, 12, 18),
// `is_active`, `fixed_installments` (cuotas con interés a cargo del cliente), `minimum_amount` y
// `maximum_amount` (y `rate`, la comisión); `amex_fixed_installments` e `is_active` (general) aparte.
// El POST no documenta el interruptor general, pero en sandbox guardar lo deja prendido (probado).
// ---------------------------------------------------------------------------------------------

export const MESES_MSI = [3, 6, 9, 12, 18] as const;

export type PlanMsi = {
  meses: number;
  activo: boolean;
  /** true = cuotas con interés que paga el cliente; false = sin intereses (los absorbe el comercio). */
  cuotasFijas: boolean;
  minimo: number | null;
  maximo: number | null;
  /** Comisión de Ecart Pay por el plazo (%; Visa y Mastercard), si la informa. */
  tasa: number | null;
};

export type ConfigMsi = {
  /** Interruptor general de la cuenta (`is_active`): si está apagado, no se ofrecen cuotas. */
  habilitado: boolean;
  planes: PlanMsi[];
  amexCuotasFijas: boolean;
};

/** Configuración de Ecart Pay → JPay. Siempre devuelve los 5 plazos (los que falten, apagados). */
export function msiDeEcart(r: unknown): ConfigMsi {
  const raiz = (r ?? {}) as Record<string, unknown>;
  const d = (raiz.data && typeof raiz.data === "object" ? raiz.data : raiz) as Record<
    string,
    unknown
  >;
  const lista = Array.isArray(d.commissions) ? (d.commissions as Record<string, unknown>[]) : [];
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    habilitado: d.is_active === true,
    planes: MESES_MSI.map((meses) => {
      const c = lista.find((x) => Number(x?.installments) === meses);
      return {
        meses,
        activo: c?.is_active === true,
        cuotasFijas: c?.fixed_installments === true,
        minimo: n(c?.minimum_amount),
        maximo: n(c?.maximum_amount),
        tasa: n(c?.rate),
      };
    }),
    amexCuotasFijas: d.amex_fixed_installments === true,
  };
}

/** Pedido de JPay (`planes`, `amex_cuotas_fijas`) → cuerpo para Ecart Pay. Valida plazos y montos. */
export function msiAEcart(b: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(b.planes)) throw new Error("Faltan los planes");
  const vistos = new Set<number>();
  const commissions = (b.planes as Record<string, unknown>[]).map((p) => {
    const meses = Number(p?.meses);
    if (!(MESES_MSI as readonly number[]).includes(meses))
      throw new Error(`Plazo inválido: ${p?.meses}`);
    if (vistos.has(meses)) throw new Error(`Plazo repetido: ${meses}`);
    vistos.add(meses);
    const monto = (v: unknown, campo: string) => {
      if (v === null || v === undefined || v === "") return undefined;
      const x = Number(v);
      if (!Number.isInteger(x) || x < 0) throw new Error(`${campo} inválido en ${meses} meses`);
      return x;
    };
    const minimo = monto(p.minimo, "Mínimo");
    const maximo = monto(p.maximo, "Máximo");
    if (minimo !== undefined && maximo !== undefined && maximo < minimo)
      throw new Error(`El máximo es menor que el mínimo en ${meses} meses`);
    return {
      installments: meses,
      is_active: p.activo === true,
      fixed_installments: p.cuotas_fijas === true,
      ...(minimo !== undefined ? { minimum_amount: minimo } : {}),
      ...(maximo !== undefined ? { maximum_amount: maximo } : {}),
    };
  });
  return { commissions, amex_fixed_installments: b.amex_cuotas_fijas === true };
}

// ---------------------------------------------------------------------------------------------
// Retiros (docs: /docs/withdrawals). Solo consulta: Ecart Pay no documenta crear retiros por API
// (se piden desde su panel). `GET /api/withdrawals` (paginado `docs` + `pages`) y las cuentas de
// retiro `GET /api/payment-methods` (la ruta `/api/accounts/payments/method` ya no existe), cuyos números (tarjeta o CLABE) nunca salen
// completos de la Edge Function.
// ---------------------------------------------------------------------------------------------

/** Deja ver solo los últimos 4 dígitos ("•••• 8751"). */
export function enmascararCuenta(numero: unknown): string | null {
  if (typeof numero !== "string" && typeof numero !== "number") return null;
  const d = String(numero).replace(/\D/g, "");
  return d.length >= 4 ? `•••• ${d.slice(-4)}` : null;
}

export type CuentaRetiro = {
  id: string;
  tipo: "clabe" | "tarjeta" | string;
  nombre: string | null;
  numero: string | null;
  banco: string | null;
  titular: string | null;
};

export function cuentaRetiroDeEcart(c: Record<string, unknown>): CuentaRetiro {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const metodo = s(c.method);
  return {
    id: String(c.id ?? c._id ?? ""),
    tipo: metodo === "debit" ? "tarjeta" : (metodo ?? "desconocido"),
    nombre: s(c.name),
    numero: enmascararCuenta(c.number),
    banco: c.bank === undefined || c.bank === null ? null : String(c.bank),
    titular: s(c.business_name),
  };
}

export type Retiro = {
  id: string;
  transaccionId: string | null;
  estado: string;
  monto: number;
  comision: number;
  moneda: string | null;
  enRevision: boolean;
  cuentaId: string | null;
  creadoAt: string | null;
  actualizadoAt: string | null;
};

export function retiroDeEcart(r: Record<string, unknown>): Retiro {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    id: String(r.id ?? r._id ?? ""),
    transaccionId: s(r.transaction_id),
    estado: s(r.status) ?? "desconocido",
    monto: n(r.amount),
    comision: n(r.fee),
    moneda: s(r.currency),
    enRevision: r.in_review === true,
    cuentaId: s(r.payment_method_id),
    creadoAt: s(r.created_at),
    actualizadoAt: s(r.updated_at),
  };
}

/** Solo para tests: limpia la caché de tokens y el modo de autorización. */
export function _reiniciarEstado(): void {
  tokens.clear();
  modoAuth = "bearer";
}
