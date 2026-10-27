import type { ComisionConfig, Cotizacion } from "@/lib/api/transferencias";
import { formatMoney, formatPercent } from "@/shared/format";

/** "1,5% del monto" o "fijo $ 5,00 por transferencia". */
const detalleComision = (c: ComisionConfig) =>
  c.modalidad === "Fijo"
    ? `fijo ${formatMoney(c.montoFijo ?? 0)} por transferencia`
    : `${formatPercent(c.porcentaje ?? 0)} del monto`;

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
