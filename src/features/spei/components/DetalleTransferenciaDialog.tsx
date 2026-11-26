import { Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnOutline, BtnPrimary } from "@/components/portal-shell";
import { useEstadoCuentaSpei } from "@/hooks/useCobre";
import { useClienteSesion } from "@/hooks/useCuenta";
import type { TransferenciaSpei } from "@/lib/api/cobre";
import { descargarComprobantePdf } from "@/lib/comprobante-pdf";
import { formatDateTime, formatMoney } from "@/shared/format";
import { ModalDialog } from "@/shared/ui/modal-dialog";
import { ESTADO_ENVIO } from "../estados";

/** Detalle de una transferencia SPEI con su comprobante en PDF y el CEP de Banxico. */
export function DetalleTransferenciaDialog({
  t,
  onClose,
}: {
  t: TransferenciaSpei | null;
  onClose: () => void;
}) {
  const { cliente } = useClienteSesion();
  const cuenta = useEstadoCuentaSpei();
  if (!t) return null;
  const e = ESTADO_ENVIO[t.estado];
  const cp = t.contraparte;
  const cep = t.cep?.startsWith("https://") ? t.cep : null;

  const descargar = () => {
    descargarComprobantePdf({
      fecha: t.creadaAt,
      monto: t.monto,
      concepto: t.concepto ?? undefined,
      estado: e.label,
      txid: t.idTxn,
      claveRastreo: t.claveRastreo ?? undefined,
      cep: cep ?? undefined,
      desde: {
        nombre: String(cliente?.nombre ?? ""),
        rfc: String(cliente?.tax_id ?? ""),
        clabe: cuenta.data?.cuenta?.clabe ?? "",
      },
      hacia: {
        nombre: cp?.titular ?? "",
        rfc: cp?.rfc ?? "",
        clabe: cp?.numero ?? "",
        banco: cp?.banco ?? undefined,
      },
    });
    toast.success("Comprobante descargado");
  };

  const filas: [string, string][] = [
    ["Fecha", formatDateTime(t.creadaAt)],
    ["Destinatario", cp?.titular ?? t.destinatario ?? "—"],
    ["CLABE destino", cp?.numero ?? "—"],
    ["RFC / CURP", cp?.rfc ?? "—"],
    ["Concepto", t.concepto ?? "—"],
    ["ID de transacción", t.idTxn],
    ["Clave de rastreo", t.claveRastreo ?? "—"],
  ];

  return (
    <ModalDialog open onClose={onClose} title="Detalle de la transferencia">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-semibold tabular-nums">{formatMoney(t.monto)}</span>
          <Badge tone={e.tone}>{e.label}</Badge>
        </div>
        {t.motivo && t.estado !== "completada" && (
          <p className="text-sm text-danger-600">{t.motivo}</p>
        )}
        <dl className="divide-y divide-black-100 text-sm">
          {filas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="text-black-400">{k}</dt>
              <dd className="text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap justify-end gap-2">
          {cep && (
            <BtnOutline onClick={() => window.open(cep, "_blank", "noopener,noreferrer")}>
              <ExternalLink size={15} /> Ver CEP en Banxico
            </BtnOutline>
          )}
          <BtnPrimary onClick={descargar}>
            <Download size={15} /> Descargar comprobante
          </BtnPrimary>
        </div>
        {cep ? (
          <p className="text-xs text-black-400">
            El CEP es el comprobante oficial de Banxico de que el pago llegó al banco destino. Puede
            tardar unos minutos en estar disponible.
          </p>
        ) : (
          t.estado === "completada" && (
            <p className="text-xs text-black-400">
              El CEP de Banxico aparece aquí en cuanto el banco lo informa.
            </p>
          )
        )}
      </div>
    </ModalDialog>
  );
}
