import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import { formatMoney } from "@/shared/format";
import type { useTransferenciaInterna } from "../hooks/useTransferenciaInterna";
import type { Sub } from "../types";

type Props = {
  subs: Sub[];
  t: ReturnType<typeof useTransferenciaInterna>;
};

function SelectSubcuenta({
  label,
  value,
  onChange,
  subs,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  subs: Sub[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 rounded-md border bg-card text-sm"
      >
        <option value="">Selecciona...</option>
        {subs.map((s) => (
          <option key={s.id ?? s.n} value={s.id}>
            {s.n} — {formatMoney(s.disp)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TransferirSubcuentasDialog({ subs, t }: Props) {
  return (
    <FormDialog
      open={t.open}
      onClose={() => t.setOpen(false)}
      title="Transferir entre subcuentas"
      description="Movimiento interno · acreditacion inmediata, sin comision."
      submitLabel="Transferir"
      onSubmit={t.transferir}
    >
      <div className="grid grid-cols-2 gap-3">
        <SelectSubcuenta label="Desde" value={t.desde} onChange={t.setDesde} subs={subs} />
        <SelectSubcuenta label="Hacia" value={t.hacia} onChange={t.setHacia} subs={subs} />
      </div>
      <div>
        <Label>Monto (ARS)</Label>
        <Input value={t.monto} onChange={(e) => t.setMonto(e.target.value)} placeholder="0,00" />
      </div>
      <div>
        <Label>Concepto</Label>
        <Input
          value={t.concepto}
          onChange={(e) => t.setConcepto(e.target.value)}
          placeholder="Barrido fin de dia, fondeo, etc."
        />
      </div>
    </FormDialog>
  );
}
