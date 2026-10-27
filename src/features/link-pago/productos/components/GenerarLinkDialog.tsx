import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import type { Product } from "@/data/links-pago";
import { formatMoney } from "@/shared/format";
import type { GenerarLink } from "../hooks/useGenerarLink";
import { montoProductos } from "../utils";

export function GenerarLinkDialog({
  form,
  products,
  selected,
}: {
  form: GenerarLink;
  products: Product[];
  selected: string[];
}) {
  return (
    <FormDialog
      open={form.open}
      onClose={form.cerrar}
      title="Generar link de pago"
      description="Configura los metodos de pago y opciones del enlace."
      submitLabel="Generar link"
      size="lg"
      onSubmit={form.generar}
    >
      <div>
        <Label>Comercio</Label>
        <select
          className="w-full h-10 px-3 rounded-md border bg-card text-sm"
          value={form.comercioId}
          onChange={(e) => form.setComercioId(e.target.value)}
        >
          <option value="">Seleccionar comercio...</option>
          {form.userComercios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre_comercio || c.id}
            </option>
          ))}
        </select>
      </div>

      <div className="p-3 rounded-md bg-muted text-xs">
        <span className="text-muted-foreground">Productos seleccionados: </span>
        <span className="font-semibold">{selected.length}</span>
        {" - "}
        <span className="font-semibold">
          {formatMoney(montoProductos(products.filter((p) => selected.includes(p.id))), {
            decimals: 0,
          })}
        </span>
      </div>

      <label className="flex items-center justify-between text-sm">
        <span className="font-semibold">Permitir pagos parciales</span>
        <input
          type="checkbox"
          checked={form.partial}
          onChange={(e) => form.setPartial(e.target.checked)}
          className="toggle"
        />
      </label>

      {!form.comercioId ? (
        <div className="p-4 rounded-md bg-muted/50 text-center text-sm text-muted-foreground">
          Selecciona un comercio para ver los metodos de pago disponibles
        </div>
      ) : form.comercioBanderas.length === 0 ? (
        <div className="p-4 rounded-md bg-muted/50 text-center text-sm text-muted-foreground">
          Este comercio no tiene metodos de pago configurados
        </div>
      ) : (
        <div>
          <Label>Metodos de pago permitidos</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {form.comercioBanderas.map((b) => {
              const isSelected = form.methods.includes(b.methodId);
              return (
                <label
                  key={b.id}
                  className={
                    "flex items-center gap-2 px-3 py-2 rounded-md border text-xs cursor-pointer transition " +
                    (isSelected
                      ? "border-primary bg-[color:var(--brand-primary-50)]"
                      : "bg-card hover:bg-muted")
                  }
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => form.toggleMethod(b.methodId)}
                    className="accent-[color:var(--brand-primary-700)]"
                  />
                  {b.bandera}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Fecha de expiracion</Label>
          <Input
            type="date"
            value={form.expires}
            onChange={(e) => form.setExpires(e.target.value)}
          />
        </div>
        <div>
          <Label>Estado</Label>
          <select
            className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            value={form.status}
            onChange={(e) => form.setStatus(e.target.value)}
          >
            <option value="Pendiente de aprobación">Pendiente de aprobación</option>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
        </div>
      </div>
      <div>
        <Label>Referencia interna</Label>
        <Input
          placeholder="FACT-0034"
          value={form.reference}
          onChange={(e) => form.setReference(e.target.value)}
        />
      </div>
      <div>
        <Label>Observaciones (opcional)</Label>
        <textarea
          className="w-full h-20 px-3 py-2 rounded-md border bg-card text-sm resize-none"
          value={form.notes}
          onChange={(e) => form.setNotes(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
