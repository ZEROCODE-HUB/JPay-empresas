/**
 * Vista del reporte de cobros con proveedores externos: período, KPIs, cobros por día, por medio,
 * por punto de cobro (y por comercio en el admin), últimos cobros y exportación.
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 */
import { FileDown, FileSpreadsheet } from "lucide-react";
import { BtnOutline } from "@/components/portal-shell";
import { formatDate, formatDateShort, formatDateTime, formatMoney, formatNumber } from "../format";
import {
  etiquetaMetodo,
  etiquetaPunto,
  LIMITE_DETALLE,
  PERIODOS_COBROS,
  type PeriodoCobros,
  type ReporteCobros,
} from "../reporte-cobros";
import { exportarReporteCobrosExcel, exportarReporteCobrosPdf } from "../reporte-cobros-export";
import type { useRangoCobros } from "../use-rango-cobros";
import { KpiCard } from "./kpi-card";

type Props = {
  rango: ReturnType<typeof useRangoCobros>;
  data: ReporteCobros | undefined;
  isLoading: boolean;
  error: unknown;
  /** Admin: corte por comercio y columna de comercio en el detalle. */
  conComercio?: boolean;
};

const th = "py-2 pr-4 font-medium";
const td = "py-2 pr-4 tabular-nums";

export function ReporteCobrosView({ rango, data, isLoading, error, conComercio = false }: Props) {
  const { periodo, elegir, setRango } = rango;
  const { desde, hasta } = rango.rango;
  const s = data?.resumen;
  const maxDia = Math.max(1, ...(data?.porDia ?? []).map((d) => d.monto));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Período
          <select
            className="mt-1 block h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
            value={periodo}
            onChange={(e) => elegir(e.target.value as PeriodoCobros | "otro")}
          >
            {PERIODOS_COBROS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="otro">Elegir fechas</option>
          </select>
        </label>
        {periodo === "otro" && (
          <>
            <label className="text-xs text-muted-foreground">
              Desde
              <input
                type="date"
                className="mt-1 block h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                value={desde}
                max={hasta}
                onChange={(e) => e.target.value && setRango({ desde: e.target.value, hasta })}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Hasta
              <input
                type="date"
                className="mt-1 block h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                value={hasta}
                min={desde}
                onChange={(e) => e.target.value && setRango({ desde, hasta: e.target.value })}
              />
            </label>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <BtnOutline
            disabled={!data}
            onClick={() => data && exportarReporteCobrosExcel(data, conComercio)}
          >
            <FileSpreadsheet size={14} /> Excel
          </BtnOutline>
          <BtnOutline
            disabled={!data}
            onClick={() => data && exportarReporteCobrosPdf(data, conComercio)}
          >
            <FileDown size={14} /> PDF
          </BtnOutline>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-danger-600">
          No se pudo armar el reporte: {(error as Error).message}
        </p>
      ) : !data || !s ? null : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Cobrado"
              value={formatMoney(s.cobrado)}
              sub={`${formatNumber(s.cantidad)} cobros`}
            />
            <KpiCard
              label="Comisión del proveedor"
              value={formatMoney(s.comision)}
              sub={s.sinConciliar > 0 ? `${s.sinConciliar} sin conciliar todavía` : undefined}
            />
            <KpiCard label="Neto" value={formatMoney(s.neto)} />
            <KpiCard
              label="Reembolsado"
              value={formatMoney(s.reembolsado)}
              sub={`${formatNumber(s.reembolsos)} reembolsos`}
            />
            <KpiCard
              label="Contracargos"
              value={formatNumber(s.contracargos)}
              sub={
                s.contracargosAbiertos > 0
                  ? `${s.contracargosAbiertos} abiertos · ${formatMoney(s.contracargosMonto)}`
                  : formatMoney(s.contracargosMonto)
              }
            />
            <KpiCard
              label="Pendientes de pago"
              value={formatNumber(s.pendientes)}
              sub={formatMoney(s.pendientesMonto)}
            />
          </div>

          <section>
            <h3 className="text-sm font-semibold">Cobrado por día</h3>
            {s.cantidad === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No hubo cobros entre el {formatDate(desde)} y el {formatDate(hasta)}.
              </p>
            ) : (
              <div className="mt-2 flex h-32 items-end gap-0.5 overflow-x-auto" role="list">
                {data.porDia.map((d) => (
                  <div
                    key={d.fecha}
                    role="listitem"
                    className="flex min-w-[10px] flex-1 flex-col items-center justify-end h-full"
                    title={`${formatDate(d.fecha)}: ${formatMoney(d.monto)} (${d.cantidad} cobros)`}
                    aria-label={`${formatDate(d.fecha)}: ${formatMoney(d.monto)}`}
                  >
                    <div
                      className="w-full rounded-t bg-primary/70"
                      style={{
                        height: `${Math.max(d.monto > 0 ? 3 : 0, (d.monto / maxDia) * 100)}%`,
                      }}
                    />
                    {data.porDia.length <= 31 && (
                      <span className="mt-1 text-[9px] text-muted-foreground">
                        {formatDateShort(d.fecha).slice(0, 2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tabla
              titulo="Por medio de pago"
              numericas={4}
              cabecera={["Medio", "Cobros", "Monto", "Comisión", "Reembolsado"]}
              filas={data.porMetodo.map((m) => [
                etiquetaMetodo(m.metodo),
                formatNumber(m.cantidad),
                formatMoney(m.monto),
                formatMoney(m.comision),
                formatMoney(m.reembolsado),
              ])}
            />
            <Tabla
              titulo="Por sucursal y caja"
              numericas={3}
              cabecera={["Punto de cobro", "Cobros", "Monto", "Comisión"]}
              filas={data.porSucursal.map((p) => [
                etiquetaPunto(p.sucursal, p.caja),
                formatNumber(p.cantidad),
                formatMoney(p.monto),
                formatMoney(p.comision),
              ])}
            />
          </div>

          {conComercio && (
            <Tabla
              titulo="Por comercio"
              numericas={5}
              cabecera={["Comercio", "Cobros", "Monto", "Comisión", "Neto", "Reembolsado"]}
              filas={data.porComercio.map((c) => [
                c.comercio ?? "—",
                formatNumber(c.cantidad),
                formatMoney(c.monto),
                formatMoney(c.comision),
                formatMoney(c.neto),
                formatMoney(c.reembolsado),
              ])}
            />
          )}

          <Tabla
            numericas={2}
            titulo={`Cobros del período${data.detalle.length > 20 ? " (últimos 20; el resto en Excel)" : ""}`}
            cabecera={[
              "Fecha",
              ...(conComercio ? ["Comercio"] : []),
              "Medio",
              "Punto",
              "Pagador",
              "Monto",
              "Comisión",
            ]}
            filas={data.detalle
              .slice(0, 20)
              .map((d) => [
                formatDateTime(d.pagadoAt),
                ...(conComercio ? [d.comercio ?? "—"] : []),
                etiquetaMetodo(d.metodo),
                etiquetaPunto(d.sucursal, d.caja),
                d.pagador ?? "—",
                formatMoney(d.monto),
                d.comision === null ? "—" : formatMoney(d.comision),
              ])}
          />
          {data.detalle.length >= LIMITE_DETALLE && (
            <p className="text-xs text-muted-foreground">
              El detalle se corta en {formatNumber(LIMITE_DETALLE)} cobros: elegí un período más
              corto para exportarlos todos. Los totales sí incluyen todo el período.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Tabla({
  titulo,
  cabecera,
  filas,
  numericas,
}: {
  titulo: string;
  cabecera: string[];
  filas: string[][];
  /** Cuántas columnas finales son importes o cantidades (van alineadas a la derecha). */
  numericas: number;
}) {
  const der = (i: number) => (i >= cabecera.length - numericas ? "text-right" : "");
  return (
    <section>
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Sin datos en el período.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left">
              <tr>
                {cabecera.map((c, i) => (
                  <th key={c} className={`${th} ${der(i)}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t border-border">
                  {f.map((v, j) => (
                    <td key={j} className={`${td} ${der(j)}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
