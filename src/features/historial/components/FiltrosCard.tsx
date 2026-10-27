import { Download, FileSpreadsheet } from "lucide-react";
import { BtnOutline, BtnPrimary, Card, Input } from "@/components/portal-shell";
import type { FiltrosHistorialState } from "../hooks/useFiltrosHistorial";
import { OPERACIONES, TIPOS_LINEA, type TipoLinea } from "../utils";

export function FiltrosCard({
  f,
  subcuentas,
  sinSubcuentas,
  loading,
  totalCount,
  agrupar,
  onAgrupar,
  onExcel,
  onPdf,
}: {
  f: FiltrosHistorialState;
  subcuentas: Array<{ nombre: string }>;
  sinSubcuentas: boolean;
  loading: boolean;
  totalCount: number;
  agrupar: boolean;
  onAgrupar: (v: boolean) => void;
  onExcel: () => void;
  onPdf: () => void;
}) {
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-end gap-4 mb-5">
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Fecha de inicio
          </label>
          <Input type="date" value={f.desde} onChange={(e) => f.setDesde(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Fecha de fin
          </label>
          <Input
            type="date"
            value={f.hasta}
            onChange={(e) => f.setHasta(e.target.value)}
            min={f.desde || undefined}
          />
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Tipo de movimiento
          </label>
          <select
            value={f.tipoLinea}
            onChange={(e) => f.setTipoLinea(e.target.value as TipoLinea | "Todos")}
            className="h-10 px-3 rounded-md border bg-card text-sm w-full sm:w-auto sm:min-w-[150px]"
          >
            {TIPOS_LINEA.map(({ k, l }) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Operación
          </label>
          <select
            value={f.categoria}
            onChange={(e) => f.setCategoria(e.target.value)}
            className="h-10 px-3 rounded-md border bg-card text-sm w-full sm:w-auto sm:min-w-[170px]"
          >
            {OPERACIONES.map(({ k, l }) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Subcuenta
          </label>
          {sinSubcuentas ? (
            <span className="inline-flex h-10 items-center text-xs text-muted-foreground">
              Sin subcuentas asociadas
            </span>
          ) : (
            <select
              value={f.subFiltro}
              onChange={(e) => f.setSubFiltro(e.target.value)}
              className="h-10 px-3 rounded-md border bg-card text-sm w-full sm:w-auto sm:min-w-[150px]"
            >
              <option value="Todas">Todas</option>
              {subcuentas.map((s) => (
                <option key={s.nombre}>{s.nombre}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="border-t pt-4 mb-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Busquedas especificas
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">CBU / CVU</label>
            <Input
              placeholder="Buscar por CBU/CVU..."
              value={f.buscarCbu}
              onChange={(e) => f.setBuscarCbu(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">CUIT</label>
            <Input
              placeholder="Buscar por CUIT..."
              value={f.buscarCuit}
              onChange={(e) => f.setBuscarCuit(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">TXID / N° Operacion</label>
            <Input
              placeholder="Buscar por TXID..."
              value={f.buscarTxid}
              onChange={(e) => f.setBuscarTxid(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nombre destino</label>
            <Input
              placeholder="Buscar por nombre destino..."
              value={f.buscarTitular}
              onChange={(e) => f.setBuscarTitular(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center border-t pt-4">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{loading ? "Cargando..." : `${totalCount} líneas`}</span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={agrupar}
              onChange={(e) => onAgrupar(e.target.checked)}
            />
            Agrupar desglose por TXID
          </label>
        </div>
        <div className="flex gap-2">
          <BtnOutline className="h-8 px-4 text-xs" onClick={f.limpiar}>
            Limpiar filtros
          </BtnOutline>
          <BtnOutline className="h-8 px-4 text-xs" onClick={onExcel}>
            <FileSpreadsheet size={13} /> Excel
          </BtnOutline>
          <BtnPrimary className="h-8 px-4 text-xs" onClick={onPdf}>
            <Download size={13} /> PDF
          </BtnPrimary>
        </div>
      </div>
    </Card>
  );
}
