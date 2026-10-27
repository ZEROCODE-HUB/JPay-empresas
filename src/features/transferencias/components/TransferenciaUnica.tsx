import { Save, ShieldCheck, Users, X } from "lucide-react";
import { Input, Label, BtnPrimary, BtnOutline } from "@/components/portal-shell";
import { ResumenCotizacion } from "./ResumenCotizacion";
import { formatMoney } from "@/shared/format";
import type { FrequentRecipient } from "@/lib/api/transferencias";
import {
  useTransferenciaUnica,
  type TransferenciaUnicaProps,
} from "../hooks/useTransferenciaUnica";
import { OTP_ENABLED, bancoConCodigo } from "../utils";
import { ConceptoSelect, FrecuentesPickerDialog, ResumenFilas } from "./campos";
import { DestinatarioValidadoCard } from "./DestinatarioValidadoCard";

/** Pestaña "Transferencia unica": formulario y pantalla de confirmación. */
export function TransferenciaUnica({
  confirm,
  frecuentes,
  ...props
}: TransferenciaUnicaProps & { confirm: boolean; frecuentes: FrequentRecipient[] }) {
  const f = useTransferenciaUnica(props);
  const { cot, selectedDestinatario: dest, subcuentaSeleccionada: origen } = f;

  if (confirm) {
    const montoNum = f.montoNumero;
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">Revisa los datos antes de confirmar.</div>
        <ResumenFilas
          filas={[
            ["Origen", origen?.nombre ?? "—"],
            ["CBU Origen", origen?.cbu ?? "—"],
            ["Destinatario", dest?.nombre ?? "-"],
            [dest?.tipoDoc || "CUIT", dest?.cuit || "—"],
            ["CBU/CVU Destino", dest?.cbu ?? "-"],
            ["Banco", bancoConCodigo(dest?.banco, dest?.bancoCodigo) || "—"],
            ["Tipo de cuenta", dest?.tipoCuenta || "—"],
            ["Monto", formatMoney(montoNum)],
            ["Comisión", cot.cotizacion ? formatMoney(cot.cotizacion.comision) : "—"],
            ["IVA", cot.cotizacion ? formatMoney(cot.cotizacion.impuesto) : "—"],
            [
              "Total a debitar",
              cot.cotizacion ? formatMoney(cot.cotizacion.total) : formatMoney(montoNum),
            ],
          ]}
        />
        {cot.insuficiente && (
          <div
            className="rounded-md border border-danger-300 bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-700"
            role="alert"
          >
            Saldo insuficiente: te faltan {formatMoney(cot.faltante)}. Volvé y ajustá el monto o el
            origen.
          </div>
        )}
        {OTP_ENABLED && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-muted rounded">
            <ShieldCheck size={14} /> Se solicitara 2FA al confirmar.
          </div>
        )}
        <div className="flex gap-2">
          <BtnOutline onClick={() => props.setConfirm(false)} className="flex-1">
            Volver
          </BtnOutline>
          <BtnPrimary
            type="button"
            disabled={cot.insuficiente || cot.cargando}
            onClick={f.confirmar}
            className="flex-1"
          >
            Confirmar transferencia
          </BtnPrimary>
        </div>
      </div>
    );
  }

  return (
    <>
      <form className="space-y-4" onSubmit={f.continuar}>
        <div>
          <Label>Destinatario (CBU/CVU/Alias)</Label>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder="22 digitos o alias (6-20)"
              value={f.searchQuery}
              onChange={(e) => f.cambiarBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void f.handleSearch();
                }
              }}
              disabled={f.searching}
            />
            <BtnOutline
              type="button"
              onClick={() => {
                void f.handleSearch();
              }}
              disabled={f.searching}
            >
              {f.searching ? "Validando..." : "Validar"}
            </BtnOutline>
          </div>
          {dest ? (
            <DestinatarioValidadoCard d={dest} />
          ) : (
            <div className="text-xs text-muted-foreground mt-1">
              Se valida contra el banco (/accounts/info) antes de continuar.
            </div>
          )}
          <BtnOutline
            type="button"
            onClick={() => f.setFrecuentesOpen(true)}
            className="w-full mt-2"
          >
            <Users size={14} /> Destinatarios frecuentes
          </BtnOutline>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Origen de fondos</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={f.subcuentaOrigen}
              onChange={(e) => f.setSubcuentaOrigen(e.target.value)}
            >
              {props.subcuentas.length === 0 && <option value="">Sin subcuentas</option>}
              {props.subcuentas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {formatMoney(Number(s.saldo_disponible))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Monto</Label>
            <Input
              type="number"
              placeholder="$ 0,00"
              value={f.monto}
              onChange={(e) => f.setMonto(e.target.value)}
              min="0"
              step="0.01"
              aria-invalid={cot.insuficiente}
              className={
                cot.insuficiente
                  ? "!border-danger-400 !text-danger-700 focus:!ring-danger-100"
                  : undefined
              }
            />
          </div>
          <div>
            <Label>Moneda</Label>
            <div className="h-10 px-3 rounded-md border bg-muted flex items-center text-sm text-muted-foreground">
              ARS — Pesos Argentinos
            </div>
          </div>
          <div className="sm:col-span-2 -mt-1">
            <ResumenCotizacion
              monto={f.montoNumero}
              disponible={f.disponibleOrigen}
              cotizacion={cot.cotizacion}
              cargando={cot.cargando}
              insuficiente={cot.insuficiente}
              faltante={cot.faltante}
            />
          </div>
          <div>
            <Label>Concepto</Label>
            <ConceptoSelect value={f.concepto} onChange={f.setConcepto} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <BtnOutline type="button" className="flex-1 min-w-[130px]" onClick={f.resetForm}>
            <X size={14} /> Cancelar
          </BtnOutline>
          <BtnOutline
            type="button"
            className="flex-1 min-w-[130px]"
            onClick={() => {
              void f.saveAsDraft();
            }}
          >
            <Save size={14} /> Guardar borrador
          </BtnOutline>
          <BtnPrimary type="submit" className="flex-1 min-w-[130px]" disabled={cot.insuficiente}>
            Continuar
          </BtnPrimary>
        </div>
      </form>

      <FrecuentesPickerDialog
        open={f.frecuentesOpen}
        onClose={() => f.setFrecuentesOpen(false)}
        frecuentes={frecuentes}
        onElegir={f.elegirFrecuente}
      />
    </>
  );
}
