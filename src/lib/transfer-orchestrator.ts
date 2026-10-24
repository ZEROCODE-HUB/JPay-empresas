// ============================================================================
// transfer-orchestrator.ts
// Orquestador desacoplado: Validación → Ejecución → Movimiento
// Garantiza principio: Validator mock/COELSA es reemplazable sin tocar saldos,
// historial, auditoría ni panel admin. El movimiento se crea SOLO tras
// ejecución exitosa, nunca al ingresar CBU.
// ============================================================================
import { requireSupabase } from "@/lib/supabase";
import {
  recipientValidator,
  type RecipientValidator,
  type RecipientValidationResult,
  detectIdentifierKind,
} from "@/lib/recipient-validation";

export type TransferKind = "unica" | "programada" | "borrador";

export type TransferRequest = {
  subcuentaOrigenId: string;
  destinatarioIdentifier: string; // CBU/CVU/Alias tal cual ingresó el usuario
  monto: number;
  concepto?: string | null;
  kind?: TransferKind;
  metadata?: Record<string, unknown>;
};

export type TransferResult =
  | { ok: true; validation: RecipientValidationResult; txn: { id_txn: string; comision: number; impuesto: number; total_debitado: number } }
  | { ok: false; validation: RecipientValidationResult; error?: string };

export type TransferOrchestratorDeps = {
  validator?: RecipientValidator;
};

/**
 * Ejecuta flujo completo: valida destinatario → si ok, llama RPC
 * `registrar_transferencia_externa`. La validación es previa y su resultado
 * queda disponible para auditoría (campo validation). Si la validación falla
 * (not_found, rejected, error, timeout) NO se genera movimiento.
 */
export async function executeTransfer(
  req: TransferRequest,
  deps: TransferOrchestratorDeps = {},
): Promise<TransferResult> {
  const validator = deps.validator ?? recipientValidator;
  const identifier = req.destinatarioIdentifier.trim();
  const kind = detectIdentifierKind(identifier);

  const validation = await validator.validate({ identifier, kind });

  if (!validation.ok) {
    return {
      ok: false,
      validation,
      error: validation.errorMessage ?? `Validación ${validation.status}`,
    };
  }

  // Normalizar a CBU para RPC (si era Alias, usar CBU del titular resuelto)
  const cbuParaRpc = validation.titular?.cbu ?? identifier;

  const sb = requireSupabase();
  const { data, error } = await sb.rpc("registrar_transferencia_externa", {
    p_subcuenta_origen: req.subcuentaOrigenId,
    p_destinatario_cbu: cbuParaRpc.replace(/\s/g, ""),
    p_monto: req.monto,
    p_concepto: req.concepto ?? null,
  });
  if (error) throw error;
  const txn = data as { ok: boolean; id_txn: string; comision: number; impuesto: number; total_debitado: number };
  return { ok: true, validation, txn };
}

// Helpers para borrador/programada/frecuente: reutilizan mismo validador
export async function validateRecipientOnly(
  identifier: string,
  validator: RecipientValidator = recipientValidator,
): Promise<RecipientValidationResult> {
  return validator.validate({ identifier: identifier.trim(), kind: detectIdentifierKind(identifier) });
}
