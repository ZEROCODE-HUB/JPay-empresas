// ============================================================================
// recipient-validation.ts
// Capa desacoplada de validación de destinatario para transferencias CBU/CVU/Alias.
// Diseño: Transferencia → Validator → Resultado → Ejecución → Movimiento
// El mock actual considera cualquier CBU/CVU/Alias sintácticamente válido como
// exitoso. Para COELSA futuro basta implementar CoelsaRecipientValidator con
// la misma interfaz sin tocar el resto del flujo (saldos, historial, admin).
// ============================================================================

export type IdentifierKind = "CBU" | "CVU" | "ALIAS" | "UNKNOWN";

export type ValidationStatus =
  | "valid"
  | "invalid_format"
  | "not_found"
  | "rejected"
  | "error"
  | "timeout";

export type RecipientValidationRequest = {
  identifier: string; // CBU/CVU (22 dígitos) o Alias (6-20 chars a-z0-9.-)
  kind?: IdentifierKind;
};

export type RecipientTitular = {
  nombre: string;
  cuit: string;
  cbu: string;
  alias: string;
  banco?: string;
  cvu?: string;
  /**
   * Datos extra que devuelve el banco en `/accounts/info` (opcionales: el mock y
   * los destinatarios guardados no los traen).
   */
  bancoCodigo?: string;
  tipoCuenta?: string;
  moneda?: string;
  activa?: boolean;
  tipoPersona?: string;
  tipoDoc?: string;
};

export type RecipientValidationResult = {
  status: ValidationStatus;
  ok: boolean; // status === 'valid'
  kind: IdentifierKind;
  identifier: string;
  titular?: RecipientTitular;
  provider: string; // "mock" | "coelsa"
  errorMessage?: string;
  raw?: unknown; // payload crudo de COELSA cuando esté disponible
  validatedAt: string; // ISO
};

export interface RecipientValidator {
  readonly provider: string;
  validate(req: RecipientValidationRequest): Promise<RecipientValidationResult>;
}

// ---------------------------------------------------------------------------
// Helpers de identificación
// ---------------------------------------------------------------------------
export function detectIdentifierKind(raw: string): IdentifierKind {
  const v = raw.trim();
  if (/^\d{22}$/.test(v)) {
    // CVU suele empezar con 00000... pero sintácticamente igual a CBU. Por ahora los tratamos igual.
    // Heurística: si empieza con 000, lo marcamos como CVU para trazabilidad; COELSA distinguirá real.
    return v.startsWith("000") ? "CVU" : "CBU";
  }
  if (/^[a-zA-Z0-9._-]{6,20}$/.test(v) && /[a-zA-Z]/.test(v)) return "ALIAS";
  return "UNKNOWN";
}

export function isValidFormat(kind: IdentifierKind, identifier: string): boolean {
  if (kind === "CBU" || kind === "CVU") return /^\d{22}$/.test(identifier.trim());
  if (kind === "ALIAS") return /^[a-zA-Z0-9._-]{6,20}$/.test(identifier.trim());
  return false;
}

// ---------------------------------------------------------------------------
// Mock validator: cualquier CBU/CVU/Alias sintácticamente válido = éxito
// NO hardcodear "todo válido" dentro de la lógica de transferencia.
// ---------------------------------------------------------------------------
const MOCK_TITULARES: RecipientTitular[] = [
  { nombre: "Proveedor SA", cuit: "30-12345678-9", cbu: "0000003100099887766112", alias: "proveedor.sa", banco: "Banco Galicia" },
  { nombre: "Estudio Rios", cuit: "30-87654321-0", cbu: "0000003200099887766223", alias: "rios.contable", banco: "Banco Nacion" },
  { nombre: "Servicios Generales", cuit: "30-11122333-4", cbu: "0000003300099887766334", alias: "serv.generales", banco: "Santander" },
  { nombre: "Juan Perez", cuit: "20-22333444-5", cbu: "0000003400099887766445", alias: "juanperez.mp", banco: "Mercado Pago" },
  { nombre: "Maria Lopez", cuit: "27-33444555-6", cbu: "0000003500099887766556", alias: "mlopez.cv", banco: "Brubank" },
];

function pickMockTitular(identifier: string, kind: IdentifierKind): RecipientTitular {
  const q = identifier.trim().toLowerCase();
  const found = MOCK_TITULARES.find(
    (t) => t.cbu === identifier.trim() || t.alias.toLowerCase() === q || t.cuit.replace(/-/g, "") === q.replace(/-/g, ""),
  );
  if (found) return found;
  // Genérico para CBU/CVU/Alias no catalogado: simula respuesta COELSA válida
  const alias = kind === "ALIAS" ? identifier.trim().toLowerCase() : `usuario.${identifier.slice(-6)}`;
  const cbu = kind === "ALIAS" ? `0000003${identifier.slice(0, 6).padEnd(16, "0")}`.slice(0, 22) : identifier.trim();
  return {
    nombre: kind === "ALIAS" ? `Titular ${alias}` : `Titular CBU ${cbu.slice(-6)}`,
    cuit: "20-00000000-0",
    cbu,
    alias,
    banco: kind === "CBU" ? "Banco Validado (mock)" : "Billetera CVU (mock)",
  };
}

export class MockRecipientValidator implements RecipientValidator {
  readonly provider = "mock";
  async validate(req: RecipientValidationRequest): Promise<RecipientValidationResult> {
    const raw = req.identifier.trim();
    const kind = req.kind ?? detectIdentifierKind(raw);
    const validatedAt = new Date().toISOString();
    if (kind === "UNKNOWN" || !isValidFormat(kind, raw)) {
      return {
        status: "invalid_format",
        ok: false,
        kind,
        identifier: raw,
        provider: this.provider,
        errorMessage: "Formato de CBU/CVU (22 dígitos) o Alias (6-20 caracteres) inválido",
        validatedAt,
      };
    }
    // Simula latencia de red 300-600ms como lo haría COELSA
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 250));
    const titular = pickMockTitular(raw, kind);
    return {
      status: "valid",
      ok: true,
      kind,
      identifier: raw,
      titular,
      provider: this.provider,
      validatedAt,
    };
  }
}

// ---------------------------------------------------------------------------
// COELSA validator (stub preparado para reemplazo futuro)
// ---------------------------------------------------------------------------
export class CoelsaRecipientValidator implements RecipientValidator {
  readonly provider = "coelsa";
  constructor(private endpoint?: string) {}
  async validate(req: RecipientValidationRequest): Promise<RecipientValidationResult> {
    // TODO: implementar llamada real a COELSA cuando esté disponible.
    // Debe mapear respuesta COELSA → RecipientValidationResult con status
    // valid | not_found | rejected | error | timeout y titular cuando corresponda.
    // Por ahora delega a mock para no romper flujo; reemplazar cuerpo sin tocar callers.
    const mock = new MockRecipientValidator();
    const r = await mock.validate(req);
    return { ...r, provider: this.provider, raw: { coelsa_stub: true, endpoint: this.endpoint } };
  }
}

// Instancia por defecto usada por toda la app. Cambiar aquí a Coelsa cuando esté listo.
export const recipientValidator: RecipientValidator = new MockRecipientValidator();