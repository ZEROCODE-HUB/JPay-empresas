import { useState, type ReactNode } from "react";
import { CheckCircle2, Copy, Download, Share2, Star, X } from "lucide-react";
import { toast } from "sonner";
import { BtnOutline, BtnPrimary } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";

// Comprobante de transferencia enviada.

export type ReciboCuenta = {
  nombre: string;
  cuit?: string;
  cvu?: string;
  banco?: string;
  alias?: string;
  /** Nombre de la subcuenta (solo origen). */
  subcuenta?: string;
};

export type ReciboTransferencia = {
  monto: number;
  fecha: string;
  txid: string;
  estado?: string;
  concepto?: string;
  comision?: number;
  impuesto?: number;
  origen: ReciboCuenta;
  destino: ReciboCuenta;
};

function Fila({
  label,
  value,
  mono,
  copiable,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  copiable?: boolean;
}) {
  const v = value && value.trim() ? value : "—";
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right break-all font-medium ${mono ? "font-mono text-[13px]" : ""}`}>
        {v}
        {copiable && v !== "—" && (
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(v).then(
                () => toast.success(`${label} copiado`),
                () => {},
              )
            }
            className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-foreground"
            title={`Copiar ${label}`}
          >
            <Copy size={12} />
          </button>
        )}
      </span>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="px-6 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {titulo}
      </div>
      {children}
    </section>
  );
}

export function TransferReceiptModal({
  recibo,
  onClose,
  onDescargar,
  onCompartir,
  onGuardarDestinatario,
}: {
  recibo: ReciboTransferencia;
  onClose: () => void;
  onDescargar: () => void;
  onCompartir: () => void;
  /** Si viene, se ofrece agendar al destinatario como frecuente. */
  onGuardarDestinatario?: () => Promise<void>;
}) {
  const [guardado, setGuardado] = useState(false);
  const fecha = new Date(recibo.fecha);
  const fechaTxt = Number.isNaN(fecha.getTime())
    ? recibo.fecha
    : fecha.toLocaleString("es-AR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  const total = recibo.monto + (recibo.comision ?? 0) + (recibo.impuesto ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-card shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          title="Cerrar"
        >
          <X size={16} />
        </button>

        {/* Encabezado: enviaste + monto + fecha */}
        <header className="px-6 pt-8 pb-6 text-center border-b bg-gradient-to-b from-emerald-50/80 to-transparent">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <div className="text-sm font-medium text-muted-foreground">Enviaste</div>
          <div className="mt-1 font-display tabular-nums text-4xl font-bold tracking-tight">
            {formatMoney(recibo.monto)}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{fechaTxt}</div>
        </header>

        <div className="divide-y">
          <Seccion titulo="Cuenta origen">
            <Fila label="Titular" value={recibo.origen.nombre} />
            <Fila label="CUIT" value={recibo.origen.cuit} mono />
            <Fila label="Subcuenta" value={recibo.origen.subcuenta} />
            <Fila label="CVU" value={recibo.origen.cvu} mono copiable />
          </Seccion>

          <Seccion titulo="Cuenta destino">
            <Fila label="Titular" value={recibo.destino.nombre} />
            <Fila label="CUIT" value={recibo.destino.cuit} mono />
            <Fila label="Banco" value={recibo.destino.banco} />
            <Fila label="CBU / CVU" value={recibo.destino.cvu} mono copiable />
            {recibo.destino.alias && <Fila label="Alias" value={`@${recibo.destino.alias}`} />}
          </Seccion>

          <Seccion titulo="Información de la operación">
            <Fila label="N° de operación" value={recibo.txid} mono copiable />
            <Fila label="Concepto" value={recibo.concepto} />
            <Fila label="Estado" value={recibo.estado || "Enviada"} />
            <Fila
              label="Comisión"
              value={recibo.comision != null ? formatMoney(recibo.comision) : undefined}
              mono
            />
            <Fila
              label="IVA"
              value={recibo.impuesto != null ? formatMoney(recibo.impuesto) : undefined}
              mono
            />
            <div className="flex justify-between gap-4 pt-2 mt-1 border-t text-sm font-semibold">
              <span>Total debitado</span>
              <span className="font-mono tabular-nums">{formatMoney(total)}</span>
            </div>
          </Seccion>
        </div>

        {onGuardarDestinatario && (
          <div className="px-6 pb-1">
            <button
              type="button"
              disabled={guardado}
              onClick={async () => {
                await onGuardarDestinatario();
                setGuardado(true);
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-60"
            >
              <Star size={13} />{" "}
              {guardado ? "Destinatario agendado" : "Agendar destinatario como frecuente"}
            </button>
          </div>
        )}

        <footer className="flex gap-2 p-6 pt-4">
          <BtnOutline type="button" className="flex-1" onClick={onCompartir}>
            <Share2 size={14} /> Compartir
          </BtnOutline>
          <BtnPrimary type="button" className="flex-1" onClick={onDescargar}>
            <Download size={14} /> Descargar comprobante
          </BtnPrimary>
        </footer>
      </div>
    </div>
  );
}
