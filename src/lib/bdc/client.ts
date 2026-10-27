/**
 * Frontend BDC client.
 *
 * This file never calls Banco de Comercio directly. It always calls
 * the platform backend (`VITE_BDC_BACKEND_URL`), where the credentials, the token
 * and the X-SIGNATURE live.
 */
import { getBdcConfig, type BdcConfig, type BdcAccount } from "./config.ts";

export class BdcError extends Error {
  readonly statusCode: number | null;
  readonly status: number | null;
  readonly body: unknown;

  constructor(
    message: string,
    opts: { statusCode?: number | null; status?: number | null; body?: unknown } = {},
  ) {
    super(message);
    this.name = "BdcError";
    this.statusCode = opts.statusCode ?? null;
    this.status = opts.status ?? null;
    this.body = opts.body ?? null;
  }
}

export type BdcEnvelope<T = unknown> = {
  statusCode: number;
  message?: string;
  data?: T;
  time?: string;
};

export type BdcOwner = {
  id?: string;
  displayName?: string;
  idType?: string;
  isPhysicalPerson?: boolean;
};

export type BdcAccountInfoData = {
  owners?: BdcOwner[];
  type?: string;
  isActive?: boolean;
  currency?: string;
  label?: string;
  accountRouting?: { scheme?: string; address?: string };
  entityRouting?: { type?: string; name?: string; code?: string };
};

export type BdcResult = BdcEnvelope;

export type BdcTransferInput = {
  /** Caller-provided id: used to look it up and avoid duplicates. */
  originId: string;
  desde: BdcAccount;
  hasta: BdcAccount;
  /** At most 2 decimals (per the API docs). */
  importe: number;
  descripcion?: string;
  concepto?: string;
  moneda?: string;
};

export type BdcTransferStatus = {
  statusCode: number;
  data?: { request?: unknown; response?: unknown; error?: unknown; estado?: string };
  time?: string;
};

const TIMEOUT_MS = 20_000;

export class BdcClient {
  private readonly cfg: BdcConfig;

  constructor(cfg: BdcConfig = getBdcConfig()) {
    this.cfg = cfg;
  }

  get config(): BdcConfig {
    return this.cfg;
  }

  private async callBackend<T = unknown>(
    metodo: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<BdcEnvelope<T>> {
    if (!this.cfg.backendUrl) {
      throw new BdcError("Falta VITE_BDC_BACKEND_URL. El frontend no puede llamar directo a BDC.", {
        statusCode: -1,
      });
    }

    const url = `${this.cfg.backendUrl}${path}`;
    const headers: Record<string, string> = { accept: "application/json" };
    const serializado = body === undefined ? undefined : JSON.stringify(body);
    if (serializado !== undefined) headers["content-type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(url, {
        method: metodo,
        headers,
        body: serializado,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      throw new BdcError(`No se pudo conectar con el backend BDC ${url}: ${mensaje}`, {
        status: null,
      });
    }

    const texto = await res.text();
    let json: BdcEnvelope<T> | null = null;
    if (texto) {
      try {
        json = JSON.parse(texto) as BdcEnvelope<T>;
      } catch {
        throw new BdcError(`El backend BDC devolvio una respuesta no JSON en ${metodo} ${path}`, {
          status: res.status,
          body: texto,
        });
      }
    }

    if (!res.ok) {
      throw new BdcError(json?.message ?? `HTTP ${res.status} en backend BDC ${metodo} ${path}`, {
        status: res.status,
        statusCode: json?.statusCode,
        body: json ?? texto,
      });
    }

    return json ?? { statusCode: 0 };
  }

  // 1) GET /healthcheck
  async healthcheck(): Promise<{ statusCode: number; time?: string }> {
    return this.callBackend("GET", "/healthcheck");
  }

  // 2) POST /auth
  async autenticar({ forzar = false }: { forzar?: boolean } = {}): Promise<string> {
    void forzar;
    return "backend";
  }

  // 3) GET /accounts/info/{CBU_CVU_ALIAS} — account holder
  async infoCuenta(direccion: string): Promise<BdcEnvelope<BdcAccountInfoData>> {
    const d = (direccion ?? "").trim();
    if (!d) throw new BdcError("Falta el CBU/CVU/Alias a consultar.", { statusCode: -1 });
    return this.callBackend<BdcAccountInfoData>("GET", `/accounts/info/${encodeURIComponent(d)}`);
  }

  // 4) POST /movements/transfer-request
  async transferir(input: BdcTransferInput): Promise<BdcResult> {
    const { originId, desde, hasta, importe, descripcion = "" } = input;
    const moneda = input.moneda ?? "032";
    const concepto = input.concepto ?? "VAR";

    if (!originId) throw new BdcError("Falta originId.", { statusCode: -1 });
    if (originId.length > 22 || !/^[a-zA-Z0-9]+$/.test(originId)) {
      throw new BdcError(
        `originId inválido: "${originId}". BDC exige hasta 22 caracteres y solo letras y números (sin guiones ni guiones bajos).`,
        { statusCode: -1 },
      );
    }
    if (!desde?.address || !desde?.personId) {
      throw new BdcError("Falta la cuenta de ORIGEN (CBU/CVU y CUIT).", { statusCode: -1 });
    }
    if (!hasta?.address || !hasta?.personId) {
      throw new BdcError("Falta la cuenta de DESTINO (CBU/CVU y CUIT).", { statusCode: -1 });
    }
    if (!Number.isFinite(importe) || importe <= 0) {
      throw new BdcError(`Importe invalido: ${importe}`, { statusCode: -1 });
    }
    const decimales = (String(importe).split(".")[1] ?? "").length;
    if (decimales > 2) {
      throw new BdcError("El importe debe tener 2 decimales como maximo (ej: 123.23).", {
        statusCode: -1,
      });
    }

    const payload = {
      originId,
      from: {
        addressType: desde.addressType ?? "CBU_CVU",
        address: desde.address,
        owner: { personIdType: desde.personIdType ?? "CUI", personId: desde.personId },
      },
      to: {
        addressType: hasta.addressType ?? "CBU_CVU",
        address: hasta.address,
        owner: { personIdType: hasta.personIdType ?? "CUI", personId: hasta.personId },
      },
      body: {
        currencyId: moneda,
        amount: importe,
        description: String(descripcion),
        concept: concepto,
      },
    };

    return this.callBackend("POST", "/transfers", payload);
  }

  // 5) GET /movements/transfer-request/{originId}
  async consultarTransferencia(originId: string): Promise<BdcTransferStatus> {
    if (!originId) throw new BdcError("Falta originId para consultar.", { statusCode: -1 });
    return this.callBackend(
      "GET",
      `/transfers/${encodeURIComponent(String(originId))}`,
    ) as Promise<BdcTransferStatus>;
  }
}

export function createBdcClient(cfg?: BdcConfig): BdcClient {
  return new BdcClient(cfg ?? getBdcConfig());
}
