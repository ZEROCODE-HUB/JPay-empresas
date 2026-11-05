import { toast } from "sonner";
import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import type { Item } from "../types";
import { CATEGORIAS } from "../utils";

export function EditarServicioDialog({
  servicio,
  onClose,
}: {
  servicio: Item | null;
  onClose: () => void;
}) {
  return (
    <FormDialog
      open={servicio !== null}
      onClose={onClose}
      title={servicio ? `Editar ${servicio.n}` : "Editar servicio"}
      description="Modifica la configuracion del servicio."
      submitLabel="Guardar cambios"
      onSubmit={() => {
        onClose();
        toast.success("Servicio actualizado");
      }}
    >
      {servicio && (
        <>
          <div>
            <Label>Numero de cuenta / referencia</Label>
            <Input defaultValue={servicio.c} />
          </div>
          <div>
            <Label>Categoria</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              defaultValue={servicio.cat}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function PagarServicioDialog({
  pagar,
  onClose,
}: {
  pagar: Item | null;
  onClose: () => void;
}) {
  return (
    <FormDialog
      open={pagar !== null}
      onClose={onClose}
      title={pagar ? `Pagar ${pagar.n}` : "Pagar servicio"}
      description={pagar ? `${pagar.c} · Vence ${pagar.venc}` : undefined}
      submitLabel="Confirmar pago"
      onSubmit={() => {
        const s = pagar;
        onClose();
        if (s) toast.success(`Pago de ${s.n} confirmado por ${s.v}`);
      }}
    >
      <div className="p-4 rounded-md bg-muted">
        <div className="text-xs text-muted-foreground">Total a pagar</div>
        <div className="font-display tabular-nums text-2xl font-semibold mt-0.5">{pagar?.v}</div>
      </div>
      <div>
        <Label>Subcuenta de origen</Label>
        <select className="w-full h-10 px-3 rounded-md border bg-card text-sm">
          <option>Cuenta principal</option>
        </select>
      </div>
      <div>
        <Label>Fecha de pago</Label>
        <Input type="date" />
      </div>
    </FormDialog>
  );
}
