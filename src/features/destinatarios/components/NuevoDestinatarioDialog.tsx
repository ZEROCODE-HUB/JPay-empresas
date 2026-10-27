import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import type { NuevoDestinatario } from "../hooks/useNuevoDestinatario";

export function NuevoDestinatarioDialog({ f }: { f: NuevoDestinatario }) {
  return (
    <FormDialog
      open={f.open}
      onClose={() => f.setOpen(false)}
      title="Nuevo destinatario"
      description="Agregalo a tu agenda para reutilizarlo en transferencias (CBU/CVU/Alias validado vía capa desacoplada)."
      submitLabel="Agregar destinatario"
      onSubmit={f.guardar}
    >
      <div>
        <Label>Nombre o razon social</Label>
        <Input
          placeholder="Ej. Proveedor SA"
          value={f.nombre}
          onChange={(e) => f.setNombre(e.target.value)}
        />
      </div>
      <div>
        <Label>Alias</Label>
        <Input
          placeholder="proveedor.sa"
          value={f.alias}
          onChange={(e) => f.setAlias(e.target.value)}
        />
      </div>
      <div>
        <Label>CBU / CVU / Alias</Label>
        <Input
          placeholder="22 dígitos o alias 6-20"
          value={f.cbu}
          onChange={(e) => f.setCbu(e.target.value)}
        />
        <div className="text-[11px] text-muted-foreground mt-1">
          Se validará vía servicio desacoplado (mock hoy, COELSA mañana)
        </div>
      </div>
      <div>
        <Label>CUIT/CUIL (opcional)</Label>
        <Input
          placeholder="XX-XXXXXXXX-X"
          value={f.cuit}
          onChange={(e) => f.setCuit(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
