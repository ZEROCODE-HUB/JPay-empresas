import { useState } from "react";
import { toast } from "sonner";
import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import type { Product } from "@/data/links-pago";
import { parsePrecio } from "../utils";

/** Alta/edición de un producto. Se monta con `key` por producto para reiniciar el estado. */
export function ProductFormDialog({
  open,
  onClose,
  product,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSave: (p: Product) => void;
}) {
  const [name, setName] = useState(product?.name || "");
  const [qty, setQty] = useState(product?.qty.toString() || "1");
  const [price, setPrice] = useState(product?.price.toString() || "");
  const [desc, setDesc] = useState(product?.desc || "");

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={product ? "Editar producto" : "Nuevo producto"}
      description="Registra un producto para asociarlo a un link de pago."
      submitLabel={product ? "Guardar cambios" : "Crear producto"}
      onSubmit={() => {
        if (!name || !price) {
          toast.error("Nombre y precio son obligatorios");
          return;
        }
        onSave({
          id: product?.id || "p" + Date.now(),
          name,
          qty: parseInt(qty) || 1,
          price: parsePrecio(price),
          desc: desc || undefined,
        });
      }}
    >
      <div>
        <Label>Nombre del producto</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Suscripcion Premium"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Cantidad</Label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <Label>Precio ($)</Label>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="29900" />
        </div>
      </div>
      <div>
        <Label>Descripcion (opcional)</Label>
        <Input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Plan mensual premium"
        />
      </div>
    </FormDialog>
  );
}
