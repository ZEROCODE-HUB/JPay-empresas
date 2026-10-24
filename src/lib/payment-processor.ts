import { getPaywayConfig, tokenizeCard } from "@/lib/payway";

/**
 * URL del backend de pagos.
 *
 * Se configura con VITE_PAYMENTS_API_URL (obligatoria: no hay URL por defecto).
 */
function backendUrl(): string {
  const url = import.meta.env.VITE_PAYMENTS_API_URL;
  if (!url) throw new Error("Falta configurar VITE_PAYMENTS_API_URL (URL del backend de pagos).");
  return url.replace(/\/+$/, "");
}

/**
 * Datos que el checkout entrega al procesador.
 *
 * Notar que `monto` es un dato de UI, no de autoridad: el backend lo ignora
 * salvo que el link tenga pagos parciales habilitados, y aun asi lo acota contra
 * el saldo pendiente. Se sigue enviando porque el usuario puede estar eligiendo
 * cuanto pagar en un link parcial.
 */
export interface PaymentRequest {
  /** Codigo del link de pago. Es lo unico identificador que el backend acepta. */
  linkCode: string;
  metodo: string;
  /**
   * UUID de la fila de `comercio_banderas` que corresponde al metodo elegido.
   *
   * El backend resuelve el `metodo_key` (y el `payment_method_id` de Payway)
   * a partir de este id; con el texto `metodo` solo puede fallar, porque el
   * mismo metodo visible (ej. "visa-cred") puede no existir como `metodo_key`
   * en el comercio.
   */
  banderaId?: string;
  monto: number;
  pagadorNombre: string;
  pagadorEmail: string;
  /**
   * Datos de la tarjeta, solo para metodos que la requieren.
   *
   * Se usan para validar y para armar la huella del intento. El SDK de Payway
   * no los consume: lee el DOM, asi que tambien hace falta `cardForm`.
   */
  card?: {
    number: string;
    holderName: string;
    expiration: string;
    securityCode: string;
  };

  /**
   * El `<form>` con los inputs `data-decidir`. El SDK oficial lee el DOM, no un
   * objeto: sin esto `createToken` no puede leer los datos de la tarjeta.
   */
  cardForm?: HTMLFormElement | null;

  documento?: { type: "dni" | "cuil" | "cuit" | "pass"; number: string };
  cuotas?: number;
}

export interface PaymentResult {
  id: string;
  estado: string;
  monto?: number;
  /**
   * Id del cobro en la pasarela.
   *
   * El backend ya lo devuelve en todos los entornos (es uno de los dos
   * identificadores que permiten cruzar un cobro con nuestro registro) pero
   * el checkout lo descartaba. Va en el comprobante que ve el pagador: es lo
   * que hay que dar si mas tarde hay que reclamar el cobro.
   */
  paywayPaymentId?: string;
  /** Id del intento que genero este cobro. */
  siteTransactionId?: string;
  /** true cuando el cobro fue simulado (el backend no llamo a Payway). */
  simulated?: boolean;
}

export interface PaymentProcessor {
  process(req: PaymentRequest): Promise<PaymentResult>;
  /**
   * Simula un pago aprobado: mismo camino que `process` (mismo
   * siteTransactionId e idempotencia) pero sin tokenizar ni llamar a la
   * pasarela. El backend registra el cobro via RPC como si estuviera
   * aprobado. Solo existe fuera de produccion (404 en prod).
   */
  simulate(req: PaymentRequest): Promise<PaymentResult>;
}

/** Estado especial: el cobro ocurrio pero el registro aun no esta confirmado. */
export class PaymentPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentPendingError";
  }
}

/**
 * Sesion de intento en curso.
 *
 * Este es el mecanismo que evita el doble cobro por reintento. El
 * `siteTransactionId` identifica UN intento de pago: si el POST falla por
 * timeout y el usuario vuelve a tocar "Pagar", hay que reusar el mismo id para
 * que el backend lo reconozca. Generar uno nuevo en cada click es exactamente el
 * bug que esta clase previene.
 *
 * El token de tarjeta SI se regenera en cada intento, porque Payway lo consume
 * y es de un solo uso. La deduplicacion la hace el site_transaction_id.
 */
type AttemptSession = {
  siteTransactionId: string;
  /** Si el resultado ya es definitivo, el proximo intento es uno nuevo. */
  definitive: boolean;
  updatedAt: number;
};

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 50;

export class PaywayProcessor implements PaymentProcessor {
  private sessions = new Map<string, AttemptSession>();

  /**
   * Huella del intento.
   *
   * Si el usuario cambia de link, metodo, monto o tarjeta, es un intento nuevo y
   * necesita un id nuevo. Si solo reintenta lo mismo, es el mismo intento.
   *
   * De la tarjeta solo se usa el ultimo digito: la huella no debe almacenar el
   * numero completo, ni siquiera en memoria.
   */
  private fingerprint(req: PaymentRequest): string {
    const last4 = req.card ? req.card.number.replace(/\D/g, "").slice(-4) : "-";
    return [
      req.linkCode,
      req.metodo,
      req.monto.toFixed(2),
      req.pagadorEmail.trim().toLowerCase(),
      req.documento?.number ?? "-",
      last4,
    ].join("|");
  }

  private sessionFor(fingerprint: string, linkCode: string): AttemptSession {
    this.prune();
    const existing = this.sessions.get(fingerprint);

    // Se reusa solo si el intento anterior sigue abierto. Si ya termino, el
    // siguiente pago es una compra nueva y necesita id propio.
    if (existing && !existing.definitive) return existing;

    const session: AttemptSession = {
      siteTransactionId: createSiteTransactionId(linkCode),
      definitive: false,
      updatedAt: Date.now(),
    };
    this.sessions.set(fingerprint, session);
    return session;
  }

  private close(fingerprint: string, session: AttemptSession) {
    session.definitive = true;
    session.updatedAt = Date.now();
  }

  private prune() {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now - session.updatedAt > SESSION_TTL_MS) this.sessions.delete(key);
    }
    // Tope duro: si el mapa crecio mas alla de lo esperado, se descarta lo mas
    // viejo. Un pico de trafico no debe convertir esto en una fuga de memoria.
    if (this.sessions.size > MAX_SESSIONS) {
      const entries = [...this.sessions.entries()].sort(
        (a, b) => a[1].updatedAt - b[1].updatedAt,
      );
      for (const [key] of entries.slice(0, entries.length - MAX_SESSIONS)) {
        this.sessions.delete(key);
      }
    }
  }

  async process(req: PaymentRequest): Promise<PaymentResult> {
    // Tokenizar es exclusivo de los metodos con tarjeta. Los offline
    // (transferencia, QR) no pasan por la pasarela, asi que no se les pide un
    // formulario ni una API Key que no van a usar.
    if (!req.cardForm) {
      throw new Error(
        "Ese metodo de pago todavia no esta disponible. Usa una tarjeta para pagar.",
      );
    }

    const api = backendUrl();
    const fingerprint = this.fingerprint(req);
    const session = this.sessionFor(fingerprint, req.linkCode);

    const config = await getPaywayConfig(api);

    // Token nuevo en cada intento: Payway lo consume y no se puede reusar.
    // El SDK devuelve ademas el BIN, que POST /payments exige y valida contra
    // el payment_method_id.
    const { token, bin } = await tokenizeCard(config, req.cardForm);

    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await fetch(`${api}/api/payway/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Site-Transaction-Id": session.siteTransactionId,
        },
        body: JSON.stringify({
          linkCode: req.linkCode,
          paymentToken: token,
          bin,
          method: req.metodo,
          installments: req.cuotas ?? 1,
          // Se manda como sugerencia. El backend lo valida contra la base.
          amount: req.monto,
          siteTransactionId: session.siteTransactionId,
          cardholder: {
            name: req.pagadorNombre,
            email: req.pagadorEmail,
            ...(req.documento ? { identification: req.documento } : {}),
          },
        }),
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      // Error de red o timeout: no sabemos si el cobro ocurrio. La sesion queda
      // ABIERTA a proposito, para que el proximo click re-use el mismo id y el
      // backend lo deduplique en vez de cobrar de nuevo.
      throw new Error(
        "No pudimos confirmar el pago. Reintenta: si ya se realizo el cargo, no se te va a volver a cobrar.",
      );
    }

    /**
     * Log de la respuesta cruda ante cualquier respuesta no exitosa.
     *
     * El `message` que ve el pagador es generico a proposito, y `debug` solo se
     * manda fuera de produccion. Sin esto, la unica forma de ver que devolvio
     * Payway de verdad era reproducir el cobro, y con tokens de un solo uso
     * reproducir no es opcion.
     *
     * El `requestId` que viene en la respuesta es el puente con el log del
     * backend: se busca en el servidor y ahi esta el detalle del upstream.
     */
    if (!res.ok || data.ok !== true) {
      console.error("[Payway] respuesta del backend:", {
        http: res.status,
        requestId: data.requestId,
        status: data.status,
        message: data.message,
        paywayStatus: data.paywayStatus,
        debug: data.debug,
        respuestaCompleta: data,
      });
    }

    // 202 con ok:false significa "cobro recibido, pendiente de registrar".
    // No es un fallo del usuario, y ademas el resultado ya es definitivo.
    if (res.status === 202) {
      this.close(fingerprint, session);
      throw new PaymentPendingError(
        String(data.message ?? "El pago fue recibido y estamos confirmando el registro."),
      );
    }

    if (res.status >= 500) {
      // El backend no pudo resolver. Dejamos la sesion abierta por la misma
      // razon que un error de red: el cobro pudo haber ocurrido.
      throw new Error(
        String(data.message ?? "No pudimos procesar el pago. Reintenta en unos segundos."),
      );
    }

    if (!res.ok || data.ok !== true) {
      // 409 "in_progress" significa que otro request con el mismo id esta en
      // curso: sigue siendo ambiguo, la sesion queda abierta.
      if (data.status === "in_progress") {
        throw new Error(
          "Ese pago ya se esta procesando. Espera unos segundos antes de reintentar.",
        );
      }

      // Cualquier otro 4xx (y tambien el 502 de un site_transaction_id mal
      // formado) es definitivo: o el pago fue rechazado o los datos no
      // sirvieron. Reintentar es un intento nuevo, con id nuevo.
      this.close(fingerprint, session);
      throw new Error(String(data.message ?? "No se pudo procesar el pago"));
    }

    this.close(fingerprint, session);
    return {
      id: String(data.pagoId ?? ""),
      estado: String(data.status ?? "approved"),
      monto: typeof data.amount === "number" ? data.amount : undefined,
      paywayPaymentId: data.paywayPaymentId != null ? String(data.paywayPaymentId) : undefined,
      siteTransactionId: data.siteTransactionId != null ? String(data.siteTransactionId) : undefined,
    };
  }

  async simulate(req: PaymentRequest): Promise<PaymentResult> {
    const api = backendUrl();
    const fingerprint = this.fingerprint(req);
    const session = this.sessionFor(fingerprint, req.linkCode);

    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await fetch(`${api}/api/payway/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Site-Transaction-Id": session.siteTransactionId,
        },
        body: JSON.stringify({
          linkCode: req.linkCode,
          // El backend prefiere banderaId (UUID): con el metodo_key resuelve
          // la bandera dentro del comercio del link. `method` queda como
          // fallback si no hay bandera mapeada.
          ...(req.banderaId ? { banderaId: req.banderaId } : { method: req.metodo }),
          installments: req.cuotas ?? 1,
          amount: req.monto,
          siteTransactionId: session.siteTransactionId,
          cardholder: {
            name: req.pagadorNombre,
            email: req.pagadorEmail,
            ...(req.documento ? { identification: req.documento } : {}),
          },
        }),
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      this.close(fingerprint, session);
      throw new Error("No pudimos conectar con el servidor de pagos. Reintenta en unos segundos.");
    }

    if (res.status === 202 || !res.ok || data.ok !== true) {
      this.close(fingerprint, session);
      const err = new Error(String(data.message ?? "No se pudo simular el pago"));
      (err as Error & { status?: string }).status = String(data.status ?? "");
      throw err;
    }

    this.close(fingerprint, session);
    return {
      id: String(data.pagoId ?? ""),
      estado: String(data.status ?? "approved"),
      monto: typeof data.amount === "number" ? data.amount : undefined,
      paywayPaymentId: data.paywayPaymentId != null ? String(data.paywayPaymentId) : undefined,
      siteTransactionId: data.siteTransactionId != null ? String(data.siteTransactionId) : undefined,
      simulated: true,
    };
  }
}

/**
 * Limite de longitud de `site_transaction_id` en Payway.
 *
 * Verificado contra sandbox: 40 caracteres devuelve 201, 41 devuelve
 * 400 `site_transaction_id (invalid_param)`. Este valor es el que se violaba
 * antes con un id de 46-77 caracteres, que hacia fallar TODO pago con un
 * mensaje imposible de interpretar.
 */
const PAYWAY_SITE_TXN_MAX = 40;

/** Caracteres aleatorios en base36. 16 ~= 82 bits de colision. */
const RAND_CHARS = 16;

/**
 * Id de intento estable, dentro del limite de Payway.
 *
 * Formato: <codigo de link recortado>-<random>. El prefijo se conserva porque
 * `pagos_intentos_payway` se lee por id y, viendo el link, se sabe de un vistazo
 * que comercio estaba detras del intento. El recorte es lo que hace que el total
 * entre en 40: el link se recorta para dejar lugar al sufijo aleatorio.
 *
 * El sufijo NO lleva timestamp a proposito. El tiempo ya esta en `created_at`,
 * y un id ordenable por tiempo invite a recortar la entropia, que es lo que
 * realmente evita que dos intentos distintos colisionen.
 */
function createSiteTransactionId(linkCode: string): string {
  const rand = randomBase36(RAND_CHARS);

  // El separador cuenta 1, y el sufijo RAND_CHARS. Lo que sobra es el prefijo.
  const roomForPrefix = PAYWAY_SITE_TXN_MAX - rand.length - 1;
  const prefix = linkCode
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, roomForPrefix);

  // Un link vacio no deberia existir, pero si pasa, sin prefijo el id empieza con
  // "-", que es feo y podria pisar alguna validacion de formato de la pasarela.
  return `${prefix || "MP"}-${rand}`;
}

function randomBase36(len: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(len);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export const paymentProcessor: PaymentProcessor = new PaywayProcessor();