import type { Dispatch, SetStateAction } from "react";
import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import { TIPOS_SUB } from "../estados";
import type { FormSubcuenta, Sub } from "../types";

import { monedaActiva } from "@/shared/format";
type Props = {
  open: boolean;
  editSub: Sub | null;
  form: FormSubcuenta;
  setForm: Dispatch<SetStateAction<FormSubcuenta>>;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
};

export function SubcuentaFormDialog({ open, editSub, form, setForm, onClose, onSubmit }: Props) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={editSub ? "Editar subcuenta" : "Nueva subcuenta"}
      description={
        editSub
          ? "Modifica los datos, el responsable y el límite diario de la subcuenta."
          : "Genera un CVU adicional asociado a tu cuenta madre."
      }
      submitLabel={editSub ? "Guardar cambios" : "Crear subcuenta"}
      onSubmit={onSubmit}
    >
      <div>
        <Label>Nombre de la subcuenta</Label>
        <Input
          value={form.n}
          onChange={(e) => setForm((p) => ({ ...p, n: e.target.value }))}
          placeholder="Ej. Sucursal Sur"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Apellido</Label>
          <Input
            value={form.apellido}
            onChange={(e) => setForm((p) => ({ ...p, apellido: e.target.value }))}
            placeholder="Apellido del titular"
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="titular@empresa.com"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tipo</Label>
          <select
            value={form.tipo}
            onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as Sub["tipo"] }))}
            className="w-full h-10 px-3 rounded-md border bg-card text-sm"
          >
            {TIPOS_SUB.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Responsable</Label>
          <Input
            value={form.resp}
            onChange={(e) => setForm((p) => ({ ...p, resp: e.target.value }))}
            placeholder="Usuario o area"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Límite diario de egreso ({monedaActiva()})</Label>
          <Input
            value={form.lim}
            onChange={(e) => setForm((p) => ({ ...p, lim: e.target.value }))}
            placeholder="Vacío = sin límite"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={form.activar}
          onChange={(e) => setForm((p) => ({ ...p, activar: e.target.checked }))}
        />{" "}
        Activar inmediatamente al crear
      </label>
    </FormDialog>
  );
}
