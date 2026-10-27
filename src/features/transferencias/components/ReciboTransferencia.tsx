import { toast } from "sonner";
import { TransferReceiptModal } from "@/components/transfer-ui";
import { descargarComprobantePdf } from "@/lib/comprobante-pdf";
import { compartirComprobante } from "@/lib/comprobante-imagen";
import type { RecipientTitular, RecipientValidationResult } from "@/lib/recipient-validation";
import type { FrequentRecipient } from "@/lib/api/transferencias";
import type { TransferSuccess } from "../types";
import { bancoConCodigo, comprobanteDe } from "../utils";

/** Comprobante que se muestra al terminar una transferencia única. */
export function ReciboTransferencia({
  open,
  transferSuccess,
  destValidation,
  destAlias,
  cerrar,
  clienteNombre,
  clienteCuit,
  frecuentes,
  onGuardarFrecuente,
}: {
  open: boolean;
  transferSuccess: TransferSuccess | null;
  destValidation: RecipientValidationResult | null;
  destAlias: string;
  cerrar: () => void;
  clienteNombre: string;
  clienteCuit: string;
  frecuentes: FrequentRecipient[];
  onGuardarFrecuente: (identifier: string, titular: RecipientTitular) => Promise<void>;
}) {
  if (!open || !transferSuccess || transferSuccess.monto == null) return null;
  const titular = destValidation?.titular;
  const comprobante = comprobanteDe(transferSuccess, titular, clienteNombre, clienteCuit);
  return (
    <TransferReceiptModal
      recibo={{
        monto: transferSuccess.monto,
        fecha: transferSuccess.fecha ?? new Date().toISOString(),
        txid: transferSuccess.txid,
        estado: transferSuccess.estado || undefined,
        concepto: transferSuccess.concepto,
        comision: transferSuccess.comision,
        impuesto: transferSuccess.impuesto,
        origen: {
          nombre: clienteNombre,
          cuit: clienteCuit,
          subcuenta: transferSuccess.origenNombre,
          cvu: transferSuccess.origenCbu,
        },
        destino: {
          nombre: titular?.nombre ?? destAlias,
          cuit: titular?.cuit,
          banco: bancoConCodigo(titular?.banco, titular?.bancoCodigo) || undefined,
          cvu: titular?.cbu ?? transferSuccess.destino,
          alias: titular?.alias || undefined,
        },
      }}
      onClose={cerrar}
      onDescargar={() => {
        if (comprobante) descargarComprobantePdf(comprobante);
      }}
      onCompartir={async () => {
        if (!comprobante) return;
        const r = await compartirComprobante(comprobante);
        if (r === "compartido") toast.success("Comprobante compartido");
        else if (r === "descargado")
          toast.info(
            "Tu navegador no comparte archivos: se descargó el comprobante para adjuntarlo.",
          );
        else if (r === "error") toast.error("No se pudo compartir el comprobante");
      }}
      onGuardarDestinatario={
        titular && !frecuentes.some((f) => f.cbu === titular.cbu)
          ? () => onGuardarFrecuente(destValidation!.identifier, titular)
          : undefined
      }
    />
  );
}
