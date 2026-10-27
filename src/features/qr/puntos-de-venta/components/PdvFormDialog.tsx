import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import type { EstadoPdv } from "@/lib/api/qr";
import type { FormPdv } from "../hooks/useAccionesPdv";

export function PdvFormDialog({
  open,
  editing,
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  form: FormPdv;
  setForm: (fn: (f: FormPdv) => FormPdv) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={editing ? "Editar Punto de Venta" : "Crear Punto de Venta"}
      description="Complete la información para habilitar el cobro mediante QR."
      submitLabel={editing ? "Guardar cambios" : "Crear Punto de Venta"}
      size="lg"
      onSubmit={onSubmit}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label>Nombre del punto de venta</Label>
          <Input
            placeholder="Ej. Caja principal"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
        </div>
        <div>
          <Label>Estado</Label>
          <select
            className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            value={form.estado}
            onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoPdv }))}
          >
            <option value="Activado">Activado</option>
            <option value="Desactivado">Desactivado</option>
            {/* Lo aprueba el admin: se muestra pero no se puede elegir. */}
            <option value="Pendiente de aprobación" disabled>
              Pendiente de aprobación
            </option>
          </select>
        </div>
      </div>
    </FormDialog>
  );
}
