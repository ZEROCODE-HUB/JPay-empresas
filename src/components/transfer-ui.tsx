import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Share2,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BtnOutline, BtnPrimary } from "@/components/portal-shell";
import { cotizarTransferencia, type ComisionConfig, type Cotizacion } from "@/lib/transfer-store";
import { formatMoney, formatPercent } from "@/shared/format";

/** "1,5% del monto" o "fijo $ 5,00 por transferencia". */
const detalleComision = (c: ComisionConfig) =>
  c.modalidad === "Fijo"
    ? `fijo ${formatMoney(c.montoFijo ?? 0)} por transferencia`
    : `${formatPercent(c.porcentaje ?? 0)} del monto`;

// ============================================================================
// Cotizacion en tiempo real
// ============================================================================

/**
 * Cotiza contra la base (misma regla de comision que se cobra al enviar), con
 * debounce. Mientras llega la respuesta, `estimado` compara el monto contra el
 * disponible local para que la validacion sea inmediata.
 */
export function useCotizacion(
  subcuentaOrigen: string,
  monto: number,
  destino: string | null | undefined,
  disponible: number,
) {
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    if (!subcuentaOrigen || !(monto > 0)) {
      setCotizacion(null);
      setCargando(false);
      return;
    }
    const id = ++pedido.current;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const c = await cotizarTransferencia({ subcuentaOrigen, monto, destino });
        if (id === pedido.current) setCotizacion(c);
      } catch {
        if (id === pedido.current) setCotizacion(null);
      } finally {
        if (id === pedido.current) setCargando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [subcuentaOrigen, monto, destino]);

  // La cotizacion vieja no vale si cambio el monto u origen.
  const vigente =
    cotizacion && cotizacion.monto === Math.round(monto * 100) / 100 ? cotizacion : null;
  const excedeDisponible = monto > 0 && monto > disponible;
  const insuficiente = excedeDisponible || (vigente ? !vigente.alcanza : false);
  const faltante = vigente ? vigente.faltante : Math.max(monto - disponible, 0);

  return { cotizacion: vigente, cargando, insuficiente, faltante };
}

/** Resumen debajo del monto: comision, IVA, total y aviso de saldo insuficiente. */
export function ResumenCotizacion({
  monto,
  disponible,
  cotizacion,
  cargando,
  insuficiente,
  faltante,
}: {
  monto: number;
  disponible: number;
  cotizacion: Cotizacion | null;
  cargando: boolean;
  insuficiente: boolean;
  faltante: number;
}) {
  if (!(monto > 0)) {
    return (
      <div className="text-xs text-muted-foreground mt-1">
        Disponible: <span className="font-mono">{formatMoney(disponible)}</span>
      </div>
    );
  }
  const cfg = cotizacion?.config ?? null;
  const sinCargo = cotizacion?.interna || !cfg;
  return (
    <div
      className={`mt-2 rounded-lg border p-3 text-sm ${insuficiente ? "border-danger-300 bg-danger-50" : "bg-muted/30"}`}
    >
      <div className="grid grid-cols-2 gap-y-1">
        <span className="text-muted-foreground">Disponible</span>
        <span className="text-right font-mono tabular-nums">
          {formatMoney(cotizacion?.disponible ?? disponible)}
        </span>
        <span className="text-muted-foreground">
          Comisión
          {cotizacion && !sinCargo && cfg && (
            <span className="ml-1 text-[11px]">· {detalleComision(cfg)}</span>
          )}
        </span>
        <span className="text-right font-mono tabular-nums">
          {cotizacion ? formatMoney(cotizacion.comision) : cargando ? "…" : "—"}
        </span>
        <span className="text-muted-foreground">
          IVA
          {cotizacion && !sinCargo && cfg && (
            <span className="ml-1 text-[11px]">
              · {formatPercent(cfg.porcentajeImpuesto)} de la comisión
            </span>
          )}
        </span>
        <span className="text-right font-mono tabular-nums">
          {cotizacion ? formatMoney(cotizacion.impuesto) : cargando ? "…" : "—"}
        </span>
        <span className="font-semibold">Total a debitar</span>
        <span className="text-right font-mono tabular-nums font-semibold">
          {cotizacion ? formatMoney(cotizacion.total) : cargando ? "…" : formatMoney(monto)}
        </span>
      </div>
      {cotizacion && (
        <div className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
          {cotizacion.interna
            ? "Transferencia entre tus cuentas: no se cobra comisión ni IVA."
            : !cfg
              ? "Esta cuenta no tiene comisión configurada para transferencias."
              : `Comisión configurada ${cfg.alcance === "cvu" ? "para la subcuenta de origen" : "para toda tu cuenta"}.`}
        </div>
      )}
      {insuficiente && (
        <div
          className="mt-2 border-t border-danger-200 pt-2 text-xs font-semibold text-danger-700"
          role="alert"
        >
          Saldo insuficiente: te faltan {formatMoney(faltante)} para cubrir el monto
          {cotizacion && cotizacion.comision > 0 ? " más comisión e IVA" : ""}.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Overlay mientras se procesa
// ============================================================================

export type PasoTransferencia = "reserva" | "envio" | "confirmacion";

const PASOS: { key: PasoTransferencia; label: string }[] = [
  { key: "reserva", label: "Reservando fondos" },
  { key: "envio", label: "Enviando al banco" },
  { key: "confirmacion", label: "Confirmando la operación" },
];

export function TransferProcessingOverlay({
  paso,
  monto,
}: {
  paso: PasoTransferencia;
  monto?: number;
}) {
  const actual = PASOS.findIndex((p) => p.key === paso);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="alertdialog"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-2xl bg-card p-7 shadow-2xl text-center">
        <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-[color:var(--brand-soft)] flex items-center justify-center">
          <Loader2 size={30} className="animate-spin text-[color:var(--brand-primary)]" />
        </div>
        <div className="text-lg font-semibold">Procesando transferencia</div>
        {monto != null && (
          <div className="mt-1 font-display tabular-nums text-2xl font-bold">
            {formatMoney(monto)}
          </div>
        )}
        <ol className="mt-6 space-y-3 text-left">
          {PASOS.map((p, i) => {
            const hecho = i < actual;
            const enCurso = i === actual;
            return (
              <li key={p.key} className="flex items-center gap-3 text-sm">
                <span
                  className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center border ${
                    hecho
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : enCurso
                        ? "border-[color:var(--brand-primary)]"
                        : "border-muted-foreground/30"
                  }`}
                >
                  {hecho ? (
                    <Check size={14} />
                  ) : enCurso ? (
                    <Loader2 size={13} className="animate-spin text-[color:var(--brand-primary)]" />
                  ) : null}
                </span>
                <span
                  className={
                    hecho
                      ? "text-muted-foreground"
                      : enCurso
                        ? "font-semibold"
                        : "text-muted-foreground/70"
                  }
                >
                  {p.label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck size={13} /> No cierres ni recargues esta ventana.
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Comprobante de transferencia enviada
// ============================================================================

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
