import { useEffect, useState } from "react";
import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import { paymentMethods, type PaymentLink } from "@/data/links-pago";
import type { EdicionLink } from "../hooks/useListaLinks";
import { dmyAIso } from "../utils";

/** Edición de estado, referencia, vencimiento, pagos parciales y métodos de un link. */
export function LinkEditDialog({
  link,
  onClose,
  onSave,
}: {
  link: PaymentLink | null;
  onClose: () => void;
  onSave: (id: string, vals: EdicionLink) => void;
}) {
  const [status, setStatus] = useState("Activo");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [expires, setExpires] = useState("");
  const [partial, setPartial] = useState(false);
  const [methods, setMethods] = useState<string[]>([]);

  useEffect(() => {
    if (link) {
      setStatus(link.status);
      setReference(link.reference ?? "");
      setNotes(link.notes ?? "");
      setExpires(link.expiresAt ? dmyAIso(link.expiresAt) : "");
      setPartial(link.partialPayments);
      setMethods(link.methods);
    }
  }, [link]);

  const toggleMethod = (id: string) => {
    setMethods((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <FormDialog
      open={link !== null}
      onClose={onClose}
      title="Editar link de pago"
      description="Modifica la configuracion del enlace de cobro."
      submitLabel="Guardar cambios"
      onSubmit={() => {
        if (!link) return;
        onSave(link.id, { status, reference, notes, expires, partial, methods });
      }}
    >
      <div>
        <Label>Estado</Label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full h-10 px-3 rounded-md border bg-card text-sm"
        >
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Referencia</Label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Factura 00123"
          />
        </div>
        <div>
          <Label>Fecha de expiracion</Label>
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Observaciones</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-20 px-3 py-2 rounded-md border bg-card text-sm resize-none"
          placeholder="Notas del cobro"
        />
      </div>
      <label className="flex items-center justify-between text-sm cursor-pointer">
        <span className="font-semibold">Permitir pagos parciales</span>
        <input
          type="checkbox"
          checked={partial}
          onChange={(e) => setPartial(e.target.checked)}
          className="toggle"
        />
      </label>
      <div>
        <Label>Metodos de pago permitidos</Label>
        {(["credit", "debit"] as const).map((cat) => (
          <div key={cat} className="mb-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
              {cat === "credit" ? "Tarjetas de Credito" : "Tarjetas de Debito"}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {paymentMethods
                .filter((m) => m.category === cat)
                .map((m) => (
                  <label
                    key={m.id}
                    className={
                      "flex items-center gap-2 px-3 py-2 rounded-md border text-xs cursor-pointer transition " +
                      (!m.enabled
                        ? "opacity-40 cursor-not-allowed"
                        : methods.includes(m.id)
                          ? "border-primary bg-[color:var(--brand-primary-50)]"
                          : "bg-card hover:bg-muted")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={methods.includes(m.id)}
                      disabled={!m.enabled}
                      onChange={() => m.enabled && toggleMethod(m.id)}
                      className="accent-[color:var(--brand-primary-700)]"
                    />
                    {m.label}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </FormDialog>
  );
}
