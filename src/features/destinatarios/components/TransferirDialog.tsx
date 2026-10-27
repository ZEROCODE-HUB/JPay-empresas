import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import { formatMoney } from "@/shared/format";
import type { TransferirDestinatario } from "../hooks/useTransferirDestinatario";

export function TransferirDialog({ t }: { t: TransferirDestinatario }) {
  const { transferir, setTransferir, sending, handleTransferir, subcuentaOrigen, subcuentas } = t;
  return (
    <FormDialog
      open={!!transferir}
      onClose={() => setTransferir(null)}
      title={`Transferir a ${transferir?.n ?? ""}`}
      description="Confirma el monto y la subcuenta de origen para enviar la transferencia."
      submitLabel={sending ? "Enviando..." : "Enviar transferencia"}
      onSubmit={handleTransferir}
    >
      {transferir && (
        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
          <div className="font-semibold text-sm text-foreground">{transferir.n}</div>
          <div className="text-muted-foreground">
            {transferir.a ? `@${transferir.a} · ` : ""}
            {transferir.b}
          </div>
          <div className="font-mono text-muted-foreground">{transferir.cbu}</div>
        </div>
      )}
      <div>
        <Label>Subcuenta de origen</Label>
        <select
          className="w-full h-10 px-3 rounded-md border bg-card text-sm"
          value={subcuentaOrigen}
          onChange={(e) => t.setSubcuentaOrigen(e.target.value)}
        >
          {subcuentas.length === 0 && <option value="">Sin subcuentas</option>}
          {subcuentas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre} — {formatMoney(Number(s.saldo_disponible))}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Monto (ARS)</Label>
        <Input
          type="number"
          value={t.monto}
          onChange={(e) => t.setMonto(e.target.value)}
          placeholder="0,00"
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <Label>Concepto</Label>
        <Input
          value={t.concepto}
          onChange={(e) => t.setConcepto(e.target.value)}
          placeholder="Pago factura, sueldo, etc."
        />
      </div>
    </FormDialog>
  );
}
