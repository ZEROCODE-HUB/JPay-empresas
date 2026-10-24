/**
 * Tokenizacion de tarjeta contra Payway usando el SDK oficial `decidir.js`.
 *
 * Por que el SDK y no un POST propio:
 *
 * 1. Es el camino que Payway aprueba. El SDK garantiza que el flujo de captura
 *    cumple SAQ-A y ademas manda el fingerprint de Cybersource que la pasarela
 *    usa para el scoring de fraude. Un POST manual puede tokenizar, pero no
 *    califica PCI por si solo ni manda ese fingerprint.
 * 2. El mapeo de campos del SDK a la API REST no es trivial: por ejemplo
 *    `card_holder_doc_type` + `card_holder_doc_number` se transforman en un
 *    objeto `card_holder_identification: {type, number}`, que es lo que la API
 *    exige. Ese mapeo esta versionado por la pasarela; hacerlo a mano es
 *    depender de un contrato que Payway puede cambiar sin aviso.
 * 3. `POST /payments` exige el `bin`, y el SDK sabe derivarlo del token sin
 *    que el backend tenga que recibir los primeros digitos de la tarjeta.
 *
 * CONTRATO REAL DEL SDK (verificado leyendo decidir.js v2.6.4, no de memoria):
 *
 *   - El script expone el global `Decidir`, que es un CONSTRUCTOR, no una
 *     instancia. Se usa `new Decidir(apiUrl)`.
 *   - `createToken` NO acepta un objeto plano: lee el formulario del DOM con
 *     `form.querySelectorAll("[data-decidir]")` y lee `.value` de cada input.
 *     Por eso el checkout tiene que renderizar la tarjeta con esos atributos.
 *   - El callback recibe DOS argumentos: `(status, data)`. No un objeto.
 *     Ademas, ante error de validacion el SDK llama `(422, {error: [...]})`
 *     sin pasar por HTTP.
 *   - La API Key se setea con `setPublishableKey()` en la instancia, y el SDK
 *     manda los headers `X-Consumer-Username` y `apikey`.
 *   - El SDK NO lee el CVV: la cadena "security" no aparece en el bundle. El
 *     `security_code` es opcional y se usa solo para re-pagar con una tarjeta
 *     ya tokenizada.
 *   - El SDK borra `card_holder_birthday` y `card_holder_door_number` si
 *     vienen vacios, pero arma `card_holder_identification` si hay algun
 *     `card_holder_doc_*` presente.
 */

/** Resultado de tokenizar: el token opaco y el BIN que exige POST /payments. */
export type TokenizeResult = {
  token: string;
  bin: string;
};

export type PaywayConfig = {
  /** API Key publica. Es publica por diseno: sin ella el checkout no puede
   *  tokenizar. La PCI nunca sale del backend. */
  apiKey: string;
  siteId: string;
  /** URL del script oficial decidir.js, del entorno que corresponda. */
  sdkUrl: string;
  /** Base de la API contra la que opera esa instancia del SDK. */
  sdkApiUrl: string;
};

let configCache: PaywayConfig | null = null;

/**
 * Obtiene la configuracion publica de la pasarela desde nuestro backend.
 *
 * Se pide al backend y no desde una variable de build del frontend para que la
 * API Key publica se pueda rotar sin recompilar ni redesplegar el checkout.
 */
export async function getPaywayConfig(backendUrl: string): Promise<PaywayConfig> {
  if (configCache) return configCache;

  const res = await fetch(`${backendUrl}/api/payway/config`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error("No pudimos configurar el medio de pago");
  }

  const data = (await res.json()) as Partial<PaywayConfig>;
  // Se identifica que falta: un "no esta disponible" generico obliga a abrir el
  // backend para descubrir si el problema es una clave, el script o el host.
  const missing: string[] = [];
  if (!data.apiKey) missing.push("apiKey");
  if (!data.sdkUrl) missing.push("sdkUrl");
  if (!data.sdkApiUrl) missing.push("sdkApiUrl");
  if (missing.length) {
    throw new Error(
      `La pasarela de pago no esta disponible (faltan: ${missing.join(", ")})`,
    );
  }

  // Los tres campos ya se validaron arriba, asi que el narrowing alcanza.
  const config = data as PaywayConfig;
  configCache = config;
  return config;
}

/**
 * Instancia del SDK, creada una vez por sesion.
 *
 * Se cachea porque cada instancia registra listeners de Cybersource y reiniciar
 * el flujo de antifraude en cada intento es justamente lo que hay que evitar.
 * La URL y la API Key vienen del backend, asi que rotarlas no exige recompilar.
 */
type DecidirInstance = {
  createToken: (form: HTMLFormElement, cb: (status: number, data: SdkTokenResponse) => void) => void;
  setPublishableKey?: (key: string) => void;
  setTimeout?: (ms: number) => void;
  getBin?: (cardNumber: string | number) => string;
};

/** Subconjunto de la respuesta de /tokens que nos interesa. */
type SdkTokenResponse = {
  id?: string;
  token?: string;
  status?: string;
  bin?: string;
  error?: unknown;
  // El SDK ante error de validacion envia {error: [{field, message}, ...]}
  message?: string;
  validation_errors?: Array<{ field?: string; message?: string }>;
};

type DecidirCtor = new (apiUrl: string) => DecidirInstance;

let sdkPromise: Promise<DecidirInstance> | null = null;

function readGlobal(): DecidirCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { Decidir?: DecidirCtor }).Decidir;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * Carga el script oficial y devuelve una instancia lista para usar.
 *
 * Si el script ya esta cargado (por ejemplo, tras un remount del checkout) se
 * reutiliza en vez de inyectarlo de nuevo: cargar el script dos veces crearia
 * dos contextos de antifraude.
 */
function loadSdk(config: PaywayConfig): Promise<DecidirInstance> {
  const existing = readGlobal();
  if (existing) {
    return Promise.resolve(instantiate(existing, config));
  }

  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<DecidirInstance>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = config.sdkUrl;
    script.async = true;

    script.onload = () => {
      const ctor = readGlobal();
      if (!ctor) {
        sdkPromise = null;
        reject(new Error("La pasarela de pago no esta disponible"));
        return;
      }
      resolve(instantiate(ctor, config));
    };

    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("No pudimos cargar la pasarela de pago"));
    };

    document.head.appendChild(script);
  });

  return sdkPromise;
}

function instantiate(ctor: DecidirCtor, config: PaywayConfig): DecidirInstance {
  const sdk = new ctor(config.sdkApiUrl);
  sdk.setTimeout?.(20_000);
  sdk.setPublishableKey?.(config.apiKey);
  return sdk;
}

/** El SDK deriva el BIN: primeros 6 digitos del numero de tarjeta. */
function deriveBin(sdk: DecidirInstance, form: HTMLFormElement): string {
  const input = form.querySelector<HTMLInputElement>('[data-decidir="card_number"]');
  const cardNumber = input?.value ?? "";

  if (typeof sdk.getBin === "function") {
    const fromSdk = sdk.getBin(cardNumber);
    if (fromSdk) return fromSdk;
  }
  return cardNumber.replace(/\D/g, "").slice(0, 6);
}

/**
 * Traduce el error del SDK a algo apto para mostrar.
 *
 * Se devuelve siempre un mensaje generico por defecto: el detalle crudo puede
 * incluir codigos del switch y datos parciales de la tarjeta. Solo se expone un
 * texto mas preciso cuando el SDK senala claramente QUE campo fallo.
 */
function sdkErrorMessage(status: number, data: SdkTokenResponse): string {
  const field = data?.validation_errors?.[0]?.field;

  if (field) {
    if (field.includes("security_code") || field.includes("cvv")) {
      return "El codigo de seguridad no coincide con la tarjeta.";
    }
    if (field.includes("expiration")) {
      return "La fecha de vencimiento no coincide con la tarjeta.";
    }
    if (field.includes("card_number")) {
      return "El numero de tarjeta no es valido.";
    }
    if (field.includes("card_holder_name")) {
      return "Ingresa el titular como figura en la tarjeta.";
    }
  }

  // 4xx sin detalle utilizable: la pasarela rechazo la operacion y no explica
  // mas. Se responde igual que ante un rechazo de tarjeta.
  if (status >= 400 && status < 500) {
    return "No pudimos validar la tarjeta. Revisa los datos e intenta de nuevo.";
  }

  return "No pudimos validar la tarjeta. Intenta de nuevo en unos segundos.";
}

/**
 * Crea un token de tarjeta usando el SDK oficial de Payway.
 *
 * `cardForm` DEBE ser el elemento `<form>` del checkout con los atributos
 * `data-decidir`: el SDK lee el DOM, no un objeto. El numero de tarjeta y el
 * CVV no se registran en ningun lado; viven en el formulario y en las
 * variables locales de esta funcion, y se descartan al volver.
 *
 * El timeout es propio y no el del SDK: si el script nunca responde, el boton
 * de pagar no puede quedar colgado para siempre.
 */
export async function tokenizeCard(
  config: PaywayConfig,
  cardForm: HTMLFormElement,
): Promise<TokenizeResult> {
  const sdk = await loadSdk(config);
  const bin = deriveBin(sdk, cardForm);

  return new Promise<TokenizeResult>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("No pudimos validar la tarjeta. Intenta de nuevo."));
    }, 20_000);

    // Firma real: (status, data). No es un unico objeto.
    sdk.createToken(cardForm, (status, data) => {
      if (settled) return;

      const body = (data ?? {}) as SdkTokenResponse;
      const token = body.token ?? body.id;

      if (status < 200 || status >= 300 || !token) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(sdkErrorMessage(status, body)));
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve({ token, bin: body.bin ?? bin });
    });
  });
}