// Cliente de Cobre (cuentas y transferencias SPEI en México) para las Edge Functions.
// Docs: https://docs.cobre.com (copia en PLAN_INTEGRACION_COBRE.md, sección 3).
//
// - Token: POST /v1/auth con user_id y secret → JWT de 20 min. Se cachea por credencial y se
//   renueva al 95% de `expiration_time`, con un solo refresco a la vez (la doc pide no pedir un
//   token por llamada). Un 401 renueva una vez y reintenta.
// - Montos en centavos y fechas en UTC. Errores: HTTP 409 con { code, description }.
// - POST /money_movements exige el encabezado `idempotency` (≥ 9 caracteres, vale 24 h).
// - Webhooks: `event-timestamp` y `event-signature` = HMAC-SHA256 (hex) de "timestamp.cuerpo".
//
// Modos (`COBRE_MODO`): `simulado` (sin credenciales; ver cobre-simulador.ts), `prueba`
// (instancia previa a producción que entrega Cobre: `COBRE_BASE_URL`) y `produccion`.
//
// Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).

export const COBRE_URL_PRODUCCION = "https://api.cobre.co/v1";

export type ModoCobre = "simulado" | "prueba" | "produccion";
export type CredencialesCobre = { userId: string; secret: string };

export class CobreError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Código del diccionario de errores de Cobre (G001, MM002, CP003…), si vino. */
    readonly codigo: string | null = null,
    readonly cuerpo?: unknown,
  ) {
    super(message);
    this.name = "CobreError";
  }
}

/** Modo configurado; sin `COBRE_MODO` es `simulado` (nunca se llama a Cobre por accidente). */
export function modoCobre(
  valor: string | null | undefined = Deno.env.get("COBRE_MODO"),
): ModoCobre {
  return valor === "prueba" || valor === "produccion" ? valor : "simulado";
}

export function baseUrlCobre(
  modo: ModoCobre,
  configurada: string | null | undefined = Deno.env.get("COBRE_BASE_URL"),
) {
  if (modo === "simulado") return "https://cobre.simulado/v1";
  if (modo === "prueba") {
    if (!configurada) throw new CobreError(500, "Falta COBRE_BASE_URL para el modo prueba");
    return configurada.replace(/\/+$/, "");
  }
  return COBRE_URL_PRODUCCION;
}

export function credencialesCobre(): CredencialesCobre | null {
  const userId = Deno.env.get("COBRE_USER_ID");
  const secret = Deno.env.get("COBRE_SECRET");
  return userId && secret ? { userId, secret } : null;
}

export const aCentavos = (unidades: number): number => Math.round(unidades * 100);
export const deCentavos = (centavos: number): number => Math.round(centavos) / 100;

type Token = { token: string; renovarEn: number };
const tokens = new Map<string, Token>();
const pidiendo = new Map<string, Promise<string>>();

type Opciones = {
  baseUrl: string;
  credenciales: CredencialesCobre;
  fetch?: typeof fetch;
  ahora?: () => number;
};

export type SolicitudCobre = {
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON, o `FormData` para los endpoints multipart (lotes). */
  body?: unknown;
  /** Clave de idempotencia (obligatoria en POST /money_movements y /cross_border_money_movements). */
  idempotency?: string;
  /** Encabezados extra (p. ej. `Idempotency-Key` de /subclients, `checker_approval` de lotes). */
  headers?: Record<string, string>;
};

export class CobreCliente {
  private readonly f: typeof fetch;
  private readonly ahora: () => number;

  constructor(private readonly o: Opciones) {
    this.f = o.fetch ?? fetch;
    this.ahora = o.ahora ?? Date.now;
  }

  private get claveCache(): string {
    return `${this.o.baseUrl}|${this.o.credenciales.userId}`;
  }

  /** Token vigente; `renovar` descarta el de caché. Un solo pedido a la vez por credencial. */
  async token(renovar = false): Promise<string> {
    const c = tokens.get(this.claveCache);
    if (!renovar && c && this.ahora() < c.renovarEn) return c.token;
    const enCurso = pidiendo.get(this.claveCache);
    if (enCurso) return enCurso;
    const p = this.pedirToken().finally(() => pidiendo.delete(this.claveCache));
    pidiendo.set(this.claveCache, p);
    return p;
  }

  private async pedirToken(): Promise<string> {
    const res = await this.f(`${this.o.baseUrl}/auth`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        user_id: this.o.credenciales.userId,
        secret: this.o.credenciales.secret,
      }),
    });
    const cuerpo = await leerCuerpo(res);
    if (!res.ok) throw errorDe(res.status, cuerpo, "No se pudo obtener el token");
    const c = (cuerpo ?? {}) as { access_token?: unknown; expiration_time?: unknown };
    if (typeof c.access_token !== "string" || !c.access_token) {
      throw new CobreError(502, "La respuesta de /auth no trae access_token", null, cuerpo);
    }
    const segundos =
      typeof c.expiration_time === "number" && c.expiration_time > 0 ? c.expiration_time : 1200;
    tokens.set(this.claveCache, {
      token: c.access_token,
      renovarEn: this.ahora() + segundos * 1000 * 0.95,
    });
    return c.access_token;
  }

  async request<T = unknown>(metodo: string, ruta: string, s: SolicitudCobre = {}): Promise<T> {
    const url = new URL(`${this.o.baseUrl}${ruta}`);
    for (const [k, v] of Object.entries(s.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    let token = await this.token();
    for (let intento = 0; ; intento++) {
      let res: Response;
      const multipart = s.body instanceof FormData;
      try {
        res = await this.f(url, {
          method: metodo,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
            ...(s.body !== undefined && !multipart ? { "content-type": "application/json" } : {}),
            ...(s.idempotency ? { idempotency: s.idempotency } : {}),
            ...(s.headers ?? {}),
          },
          body: multipart
            ? (s.body as FormData)
            : s.body !== undefined
              ? JSON.stringify(s.body)
              : undefined,
        });
      } catch (e) {
        throw new CobreError(503, `Sin respuesta de Cobre: ${(e as Error).message}`);
      }
      if (res.status === 401 && intento === 0) {
        await res.body?.cancel();
        token = await this.token(true);
        continue;
      }
      const cuerpo = await leerCuerpo(res);
      if (!res.ok) throw errorDe(res.status, cuerpo, `Cobre respondió ${res.status}`);
      return cuerpo as T;
    }
  }

  get<T = unknown>(ruta: string, query?: SolicitudCobre["query"]): Promise<T> {
    return this.request<T>("GET", ruta, { query });
  }

  post<T = unknown>(
    ruta: string,
    body: unknown,
    idempotency?: string,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>("POST", ruta, { body, idempotency, headers });
  }

  delete<T = unknown>(ruta: string): Promise<T> {
    return this.request<T>("DELETE", ruta);
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

function errorDe(status: number, cuerpo: unknown, porDefecto: string): CobreError {
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
  const codigo = typeof c.code === "string" && c.code ? c.code : null;
  const desc = typeof c.description === "string" && c.description ? c.description : null;
  return new CobreError(
    status,
    desc ? (codigo ? `${codigo}: ${desc}` : desc) : porDefecto,
    codigo,
    cuerpo,
  );
}

// ---------------------------------------------------------------------------------------------
// Transferencias (money movements) y sus estados
// ---------------------------------------------------------------------------------------------

/** Estado de JPay para una transferencia según el `status.state` de Cobre. */
export type EstadoTransferencia =
  "pendiente" | "pendiente_aprobacion" | "completada" | "rechazada" | "fallida" | "cancelada";

const ESTADOS: Record<string, EstadoTransferencia> = {
  initiated: "pendiente",
  processing: "pendiente",
  pending_approval: "pendiente_aprobacion",
  completed: "completada",
  rejected: "rechazada",
  failed: "fallida",
  canceled: "cancelada",
};

/** Estados finales en los que el dinero no salió (hay que reintegrar al cliente). */
export const SIN_DEBITO: EstadoTransferencia[] = ["rechazada", "fallida", "cancelada"];

/** Motivos en español para los códigos más comunes (catálogo "Money Movement Statuses"). */
const MOTIVOS: Record<string, string> = {
  F001: "No se pudo procesar la transferencia; intentá de nuevo",
  F002: "Fondos insuficientes en la cuenta de origen",
  F003: "La solicitud de pago venció",
  F004: "Se alcanzó el límite diario de transferencias",
  F005: "El monto supera el máximo permitido por transferencia",
  F098: "Cobre no pudo procesarla en este momento; se reintenta más tarde",
  F099: "Cobre no pudo procesarla en este momento; se reintenta más tarde",
  R000: "Transferencia rechazada",
  R001: "La cuenta de destino está inactiva o bloqueada",
  R002: "La cuenta y la identificación del titular no coinciden",
  R004: "Identificación del titular inválida",
  R005: "La cuenta de destino no existe",
  R006: "Número de cuenta inválido",
  R008: "El beneficiario devolvió el pago",
  R009: "El monto supera el máximo permitido",
  R010: "La cuenta no está autorizada a debitar",
  R011: "Tipo de cuenta inválido",
  R012: "El pagador abandonó el pago",
  R013: "El banco de destino no está disponible",
  R015: "La cuenta de destino no admite abonos",
  R016: "El pago se rechazó por tiempo de espera",
  R017: "La solicitud de pago venció",
  R019: "El monto pagado no coincide",
  R020: "Falló la autenticación del pagador",
  R021: "El pagador no tenía fondos suficientes",
  R023: "Cancelada por el usuario",
  R024: "Se superó la cantidad de transferencias permitidas",
  R025: "Faltan datos obligatorios",
  R026: "El banco de destino no está operando",
  R027: "La cuenta de destino superó su límite",
  R034: "La cuenta de destino está cancelada",
  R036: "El proveedor está en contingencia; intentá más tarde",
  R085: "Error del banco al procesar",
};

export type ResumenTransferencia = {
  id: string;
  estado: EstadoTransferencia;
  estadoCobre: string;
  codigo: string | null;
  motivo: string | null;
  claveRastreo: string | null;
  cep: string | null;
  externalId: string | null;
  monto: number | null;
};

/** Resume un money movement (respuesta de la API o `content` de un webhook). */
export function resumirTransferencia(mm: unknown): ResumenTransferencia {
  const m = (mm ?? {}) as Record<string, unknown>;
  const st = (m.status ?? {}) as Record<string, unknown>;
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const estadoCobre = s(st.state) ?? "desconocido";
  const codigo = s(st.code);
  const estado = ESTADOS[estadoCobre] ?? "pendiente";
  return {
    id: s(m.id) ?? "",
    estado,
    estadoCobre,
    codigo,
    motivo: codigo
      ? (MOTIVOS[codigo] ?? s(st.description) ?? `Código ${codigo}`)
      : estado === "pendiente" || estado === "completada"
        ? null
        : (s(st.description) ?? null),
    claveRastreo: s(meta.tracking_key),
    cep: s(meta.cep_url),
    externalId: s(m.external_id),
    monto: typeof m.amount === "number" ? deCentavos(m.amount) : null,
  };
}

/** Cuerpo de POST /money_movements para un pago SPEI. `referencia` debe ser numérica (≤ 7). */
export function transferenciaSpei(o: {
  cuentaOrigen: string;
  contraparte: string;
  monto: number;
  concepto: string;
  referencia: string;
  externalId: string;
  aprobacion?: boolean;
}): Record<string, unknown> {
  if (!(o.monto > 0)) throw new CobreError(400, "Monto inválido");
  if (!/^\d{1,7}$/.test(o.referencia))
    throw new CobreError(400, "La referencia SPEI debe ser numérica (hasta 7 dígitos)");
  return {
    source_id: o.cuentaOrigen,
    destination_id: o.contraparte,
    amount: aCentavos(o.monto),
    metadata: { description: o.concepto.slice(0, 40), reference: o.referencia },
    external_id: o.externalId,
    checker_approval: o.aprobacion === true,
  };
}

/** Referencia numérica estable de 7 dígitos a partir de un id (para `metadata.reference`). */
export function referenciaNumerica(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 10_000_000;
  return String(h).padStart(7, "0");
}

// ---------------------------------------------------------------------------------------------
// Contrapartes (destinatarios) México
// ---------------------------------------------------------------------------------------------

export type DestinatarioMx = {
  tipo: "clabe" | "spei_card";
  numero: string;
  /** Código de institución SPEI (obligatorio para tarjeta SPEI). */
  banco?: string | null;
  titular: string;
  idTipo: "rfc" | "curp";
  idNumero: string;
  alias?: string | null;
};

/** Cuerpo de POST /counterparties (geo `mex`). Sin caracteres especiales en el nombre. */
export function contraparteMx(d: DestinatarioMx): Record<string, unknown> {
  const numero = d.numero.replace(/\D/g, "");
  if (d.tipo === "clabe" && numero.length !== 18)
    throw new CobreError(400, "La CLABE debe tener 18 dígitos");
  if (d.tipo === "spei_card" && (numero.length < 15 || numero.length > 16)) {
    throw new CobreError(400, "La tarjeta SPEI debe tener 15 o 16 dígitos");
  }
  if (d.tipo === "spei_card" && !d.banco) throw new CobreError(400, "Falta el banco de la tarjeta");
  const titular = d.titular
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!titular) throw new CobreError(400, "Falta el nombre del titular");
  const comunes = {
    counterparty_fullname: titular,
    counterparty_id_type: d.idTipo,
    counterparty_id_number: d.idNumero.trim().toUpperCase() || "ND",
  };
  return {
    geo: "mex",
    type: d.tipo,
    ...(d.alias ? { alias: d.alias.slice(0, 32) } : {}),
    metadata:
      d.tipo === "clabe"
        ? { account_number: numero, ...comunes }
        : { card_number: numero, beneficiary_institution: d.banco, ...comunes },
  };
}

export type DestinatarioUsd = {
  rail: "fedwire" | "swift";
  titular: string;
  idTipo: string;
  idNumero: string;
  correo: string;
  telefono: string;
  sitioWeb?: string | null;
  /** País de constitución del beneficiario (ISO alfa-3). */
  paisConstitucion: string;
  direccion: {
    calle1: string;
    calle2?: string | null;
    ciudad: string;
    estado: string;
    cp: string;
    pais: string;
  };
  banco: {
    nombre: string;
    cuenta: string;
    tipoCuenta?: "checking" | "savings" | "";
    /** ABA (Fedwire). */
    aba?: string | null;
    /** BIC (SWIFT). */
    bic?: string | null;
    direccion: {
      pais: string;
      ciudad?: string | null;
      estado?: string | null;
      cp?: string | null;
      calle1?: string | null;
    };
  };
  alias?: string | null;
};

/**
 * Cuerpo de POST /counterparties tipo `business` para Fedwire (ABA en `routing_number`, geo `usa`)
 * o SWIFT (BIC en `bic`, `routing_number` vacío, geo = país del beneficiario en minúsculas).
 */
export function contraparteUsd(d: DestinatarioUsd): Record<string, unknown> {
  const pais3 = (v: string, que: string) => {
    const x = (v ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(x))
      throw new CobreError(400, `${que}: código de país inválido (ISO alfa-3)`);
    return x;
  };
  const cuenta = d.banco.cuenta.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{4,34}$/.test(cuenta)) throw new CobreError(400, "Número de cuenta inválido");
  const aba = (d.banco.aba ?? "").replace(/\D/g, "");
  const bic = (d.banco.bic ?? "").trim().toUpperCase();
  if (d.rail === "fedwire" && !/^\d{9}$/.test(aba))
    throw new CobreError(400, "El ABA tiene 9 dígitos");
  if (d.rail === "swift" && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
    throw new CobreError(400, "BIC/SWIFT inválido (8 u 11 caracteres)");
  }
  const titular = d.titular.trim();
  if (!titular) throw new CobreError(400, "Falta el nombre del beneficiario");
  const paisDir = pais3(d.direccion.pais, "Dirección del beneficiario");
  return {
    geo: d.rail === "fedwire" ? "usa" : paisDir.toLowerCase(),
    type: "business",
    alias: (d.alias || titular).slice(0, 32),
    metadata: {
      counterparty_fullname: titular,
      counterparty_id_type: d.idTipo,
      counterparty_id_number: d.idNumero.trim(),
      counterparty_phone: d.telefono.trim(),
      counterparty_email: d.correo.trim(),
      counterparty_website: d.sitioWeb?.trim() ?? "",
      counterparty_incorporation_country: pais3(d.paisConstitucion, "País de constitución"),
      counterparty_address: {
        street_line1: d.direccion.calle1.trim(),
        street_line2: d.direccion.calle2?.trim() ?? "",
        city: d.direccion.ciudad.trim(),
        state: d.direccion.estado.trim(),
        postal_code: d.direccion.cp.trim(),
        country: paisDir,
      },
      counterparty_bank_details: {
        rail: d.rail,
        currency: "usd",
        bank_name: d.banco.nombre.trim(),
        account_type: d.banco.tipoCuenta ?? "",
        account_number: cuenta,
        routing_number: d.rail === "fedwire" ? aba : "",
        ...(d.rail === "swift" ? { bic } : {}),
        bank_address: {
          country: pais3(d.banco.direccion.pais, "País del banco"),
          ...(d.banco.direccion.ciudad ? { city: d.banco.direccion.ciudad } : {}),
          ...(d.banco.direccion.estado ? { state: d.banco.direccion.estado } : {}),
          ...(d.banco.direccion.cp ? { postal_code: d.banco.direccion.cp } : {}),
          ...(d.banco.direccion.calle1 ? { street_line1: d.banco.direccion.calle1 } : {}),
        },
      },
    },
  };
}

/** `counterparty_verification_status` de una contraparte `business` → estado de JPay. */
export function verificacionUsd(cp: unknown): "procesando" | "verified" | "rejected" | "failed" {
  const meta = (((cp ?? {}) as Record<string, unknown>).metadata ?? {}) as Record<string, unknown>;
  const v = String(meta.counterparty_verification_status ?? "").toLowerCase();
  return v === "verified"
    ? "verified"
    : v === "rejected"
      ? "rejected"
      : v === "failed"
        ? "failed"
        : "procesando";
}

// ---------------------------------------------------------------------------------------------
// Subclientes (alta KYB del comercio, "Named Accounts") y su Cobre Balance
// ---------------------------------------------------------------------------------------------

export type PersonaKyb = {
  nombre: string;
  apellido: string;
  idTipo: "rfc" | "curp";
  idNumero: string;
  /** ISO 3166-1 alfa-3 (MEX, USA…). */
  nacionalidades: string[];
  fechaNacimiento: string;
};

export type DatosSubcliente = {
  razonSocial: string;
  nombreCorto: string;
  rfc: string;
  correo: string;
  telefono: string;
  sitioWeb: string;
  industria: string;
  fechaConstitucion: string;
  paisConstitucion: string;
  paisOperacion: string;
  domicilio: { calle: string; ciudad: string; estado: string; cp: string; pais: string };
  representantes: PersonaKyb[];
  ubos: PersonaKyb[];
};

/** Largo máximo de `short_name`: Cobre lo combina con su acrónimo y el total no pasa de 40. */
export const MAX_NOMBRE_CORTO = 30;

const sinAcentos = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Cuerpo de POST /subclients y la lista de lo que falta (vacía = se puede enviar). Las fechas
 * van en AAAA-MM-DD y los países en ISO alfa-3.
 */
export function subclienteCobre(d: DatosSubcliente): {
  cuerpo: Record<string, unknown>;
  faltan: string[];
} {
  const faltan: string[] = [];
  const req = (v: string | null | undefined, que: string) => {
    if (!v || !v.trim()) faltan.push(que);
    return (v ?? "").trim();
  };
  const fecha = (v: string, que: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) faltan.push(que);
    return v;
  };
  const pais = (v: string, que: string) => {
    const x = (v ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(x)) faltan.push(que);
    return x;
  };
  const persona = (p: PersonaKyb, que: string) => ({
    first_name: req(sinAcentos(p.nombre), `${que}: nombre`),
    last_name: req(sinAcentos(p.apellido), `${que}: apellido`),
    id_type: p.idTipo,
    id_number: req(p.idNumero?.toUpperCase(), `${que}: RFC o CURP`),
    nationalities: p.nacionalidades.length
      ? p.nacionalidades.map((n) => pais(n, `${que}: nacionalidad`))
      : (faltan.push(`${que}: nacionalidad`), []),
    date_of_birth: fecha(p.fechaNacimiento ?? "", `${que}: fecha de nacimiento`),
  });

  const nombreCorto = sinAcentos(d.nombreCorto ?? "").slice(0, MAX_NOMBRE_CORTO);
  const telefono = (d.telefono ?? "").replace(/[^\d+]/g, "");
  if (!/^\+\d{10,15}$/.test(telefono)) faltan.push("Teléfono con código de país (+52…)");
  if (!d.representantes.length) faltan.push("Al menos un representante legal");
  if (!d.ubos.length) faltan.push("Al menos un beneficiario final");
  const web = (d.sitioWeb ?? "").trim();
  const cuerpo = {
    legal_name: req(d.razonSocial, "Razón social"),
    short_name: req(nombreCorto, "Nombre corto"),
    id_type: "rfc",
    id_number: req(d.rfc?.toUpperCase(), "RFC"),
    email: req(d.correo, "Correo"),
    phone: telefono,
    website: req(web && !/^https?:\/\//.test(web) ? `https://${web}` : web, "Sitio web"),
    industry: req(d.industria, "Industria"),
    date_of_incorporation: fecha(d.fechaConstitucion ?? "", "Fecha de constitución"),
    country_of_incorporation: pais(d.paisConstitucion, "País de constitución"),
    country_of_operation: pais(d.paisOperacion, "País de operación"),
    address: {
      street: req(d.domicilio.calle, "Domicilio: calle"),
      city: req(d.domicilio.ciudad, "Domicilio: ciudad"),
      state: req(d.domicilio.estado, "Domicilio: estado"),
      postal_code: req(d.domicilio.cp, "Domicilio: código postal"),
      country: pais(d.domicilio.pais, "Domicilio: país"),
    },
    legal_representatives: d.representantes.map((p, i) => persona(p, `Representante ${i + 1}`)),
    ubos: d.ubos.map((p, i) => persona(p, `Beneficiario ${i + 1}`)),
  };
  return { cuerpo, faltan: [...new Set(faltan)] };
}

export type EstadoSubcliente = "processing" | "approved" | "rejected" | "failed";

/** Estado de un Subcliente: la API usa `status.state` y el webhook `status` como cadena. */
export function estadoSubcliente(sc: unknown): {
  id: string;
  estado: EstadoSubcliente | null;
  motivo: string | null;
} {
  const x = (sc ?? {}) as Record<string, unknown>;
  const st = x.status;
  const v =
    typeof st === "string"
      ? st
      : typeof (st as Record<string, unknown> | null)?.state === "string"
        ? String((st as Record<string, unknown>).state)
        : null;
  const ok = ["processing", "approved", "rejected", "failed"].includes(v ?? "");
  const desc = (st as Record<string, unknown> | null)?.description;
  return {
    id: String(x.id ?? ""),
    estado: ok ? (v as EstadoSubcliente) : null,
    motivo: typeof desc === "string" && desc ? desc : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Depósitos y webhooks
// ---------------------------------------------------------------------------------------------

export type DepositoSpei = {
  transaccionId: string;
  cuentaId: string | null;
  /** CLABE (virtual o de la cuenta) que recibió el depósito. */
  clabeDestino: string | null;
  monto: number;
  remitente: string | null;
  remitenteCuenta: string | null;
  remitenteId: string | null;
  concepto: string | null;
  claveRastreo: string | null;
  cep: string | null;
  fecha: string | null;
};

/** Transacción `spei_credit` (API o `content` de `accounts.balance.credit`); null si es otra. */
export function depositoSpei(t: unknown): DepositoSpei | null {
  const x = (t ?? {}) as Record<string, unknown>;
  if (x.type !== "spei_credit") return null;
  const meta = (x.metadata ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v && v !== "N/A" ? v : null);
  return {
    transaccionId: String(x.id ?? ""),
    cuentaId: s(x.account_id) ?? s(x.accountId),
    clabeDestino: s(meta.account_reference),
    monto: typeof x.amount === "number" ? deCentavos(Math.abs(x.amount)) : 0,
    remitente: s(meta.sender_name),
    remitenteCuenta: s(meta.sender_account_number),
    remitenteId: s(meta.sender_id),
    concepto: s(meta.description),
    claveRastreo: s(meta.tracking_key),
    cep: s(meta.cep),
    fecha: s(x.date) ?? s(x.transaction_date),
  };
}

/** Transacción de un Cobre Balance (API o `content` de `accounts.balance.*`), de cualquier tipo. */
export type TransaccionCobre = {
  id: string;
  /** `spei_credit`, `r2p_spei_credit`, `spei_debit`, `spei_rejected`, `cbmm_credit`… */
  tipo: string;
  cuentaId: string | null;
  /** En unidades, con signo (negativo en débitos). */
  monto: number;
  moneda: string | null;
  mmId: string | null;
  mmExternalId: string | null;
  fecha: string | null;
};

export function transaccionCobre(t: unknown): TransaccionCobre {
  const x = (t ?? {}) as Record<string, unknown>;
  const meta = (x.metadata ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v && v !== "N/A" ? v : null);
  return {
    id: String(x.id ?? ""),
    tipo: String(x.type ?? ""),
    cuentaId: s(x.account_id) ?? s(x.accountId),
    monto: typeof x.amount === "number" ? deCentavos(x.amount) : 0,
    moneda: s(x.currency),
    mmId: s(meta.money_movement_id),
    mmExternalId: s(meta.mm_external_id),
    fecha: s(x.operation_date) ?? s(x.date) ?? s(x.transaction_date),
  };
}

export type FamiliaEvento =
  | "money_movements"
  | "accounts.balance"
  | "subclient"
  | "cross_border_money_movements"
  | "bulk_money_movements";

/** Familia y estado de un `event_key` (`money_movements.status.completed` → familia, `completed`). */
export function claveEvento(evento: string | null): {
  familia: FamiliaEvento | null;
  estado: string | null;
} {
  if (!evento) return { familia: null, estado: null };
  const m =
    /^(money_movements|subclient|cross_border_money_movements|bulk_money_movements)\.status\.([a-z_]+)$/.exec(
      evento,
    );
  if (m) return { familia: m[1] as FamiliaEvento, estado: m[2] };
  const b = /^accounts\.balance\.(credit|debit)$/.exec(evento);
  if (b) return { familia: "accounts.balance", estado: b[1] };
  return { familia: null, estado: null };
}

export type EventoCobre = {
  id: string | null;
  evento: string | null;
  contenido: Record<string, unknown>;
};

/** Sobre de una notificación: `{ id, event_key, created_at, content }`. */
export function leerEventoCobre(cuerpo: unknown): EventoCobre {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  return {
    id: typeof c.id === "string" && c.id ? c.id : null,
    evento: typeof c.event_key === "string" && c.event_key ? c.event_key : null,
    contenido: (c.content && typeof c.content === "object" ? c.content : {}) as Record<
      string,
      unknown
    >,
  };
}

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function firmarCobre(
  clave: string,
  timestamp: string,
  cuerpo: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${cuerpo}`)),
  );
}

/** Verifica `event-signature` sobre el cuerpo crudo (comparación en tiempo constante). */
export async function verificarFirmaCobre(o: {
  clave: string;
  timestamp: string | null;
  firma: string | null;
  cuerpo: string;
  /** Antigüedad máxima del `event-timestamp` (ms); por defecto 15 min. Protege contra reenvíos. */
  vigenciaMs?: number;
  ahora?: number;
}): Promise<boolean> {
  if (!o.timestamp || !o.firma) return false;
  const ms = msDeTimestamp(o.timestamp);
  if (ms !== null && Math.abs((o.ahora ?? Date.now()) - ms) > (o.vigenciaMs ?? 15 * 60_000)) {
    return false;
  }
  const esperada = await firmarCobre(o.clave, o.timestamp, o.cuerpo);
  const recibida = o.firma
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, "");
  if (esperada.length !== recibida.length) return false;
  let dif = 0;
  for (let i = 0; i < esperada.length; i++) dif |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  return dif === 0;
}

/** `event-timestamp` a milisegundos: epoch en segundos o ms, o fecha ISO; null si no se entiende. */
export function msDeTimestamp(t: string): number | null {
  const v = t.trim();
  if (/^\d{10}(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  if (/^\d{13}$/.test(v)) return Number(v);
  const p = Date.parse(v);
  return Number.isNaN(p) ? null : p;
}

/** Solo para tests: limpia la caché de tokens. */
export function _reiniciarCobre(): void {
  tokens.clear();
  pidiendo.clear();
}
