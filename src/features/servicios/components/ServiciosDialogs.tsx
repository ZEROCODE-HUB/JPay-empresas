import { toast } from "sonner";
import { Card, Input, Label } from "@/components/portal-shell";
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
          <option>Operaciones — $ 6.389.830,55</option>
          <option>Sucursal Centro — $ 4.220.000,00</option>
          <option>Sucursal Norte — $ 1.870.500,00</option>
        </select>
      </div>
      <div>
        <Label>Fecha de pago</Label>
        <Input type="date" />
      </div>
    </FormDialog>
  );
}

export function RemesaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Enviar remesa internacional"
      description="Procesada via MORE · cotizacion aplicada al confirmar."
      submitLabel="Enviar remesa"
      size="lg"
      onSubmit={() => {
        onClose();
        toast.success("Remesa enviada · en proceso de liquidacion");
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Monto en ARS</Label>
          <Input placeholder="$ 0,00" />
        </div>
        <div>
          <Label>Pais destino</Label>
          <select className="w-full h-10 px-3 rounded-md border bg-card text-sm">
            <option>Colombia</option>
            <option>Mexico</option>
            <option>Espana</option>
            <option>Brasil</option>
            <option>Chile</option>
            <option>Uruguay</option>
          </select>
        </div>
      </div>
      <div>
        <Label>Banco / cuenta del destinatario</Label>
        <Input placeholder="Ej. Bancolombia · Cuenta ahorros 1234-5678" />
      </div>
      <div>
        <Label>Beneficiario</Label>
        <Input placeholder="Nombre completo y documento" />
      </div>
      <div>
        <Label>Tipo de conversion</Label>
        <select className="w-full h-10 px-3 rounded-md border bg-card text-sm">
          <option>Automatico (mejor cotizacion disponible)</option>
          <option>Bonos (AL30/AL30D)</option>
          <option>Cripto (USDT)</option>
          <option>P2P</option>
        </select>
      </div>
      <Card className="bg-muted/30">
        <div className="text-xs text-muted-foreground">Estimacion al confirmar</div>
        <div className="flex justify-between mt-1">
          <span className="font-semibold">1 ARS = 4,02 COP</span>
          <span className="font-semibold">≈ COP 4.020.000</span>
        </div>
      </Card>
    </FormDialog>
  );
}
