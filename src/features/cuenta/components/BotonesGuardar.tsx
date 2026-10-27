import { BtnOutline, BtnPrimary } from "@/components/portal-shell";
import type { CuentaPantalla } from "../hooks/useCuentaPantalla";

/** "Cancelar" / "Guardar cambios" al pie de cada tarjeta editable de la ficha. */
export function BotonesGuardar({ c, className }: { c: CuentaPantalla; className: string }) {
  return (
    <div className={className}>
      <BtnOutline disabled={c.saving} onClick={c.cancelar}>
        Cancelar
      </BtnOutline>
      <BtnPrimary disabled={c.saving} onClick={c.guardar}>
        {c.saving ? "Guardando…" : "Guardar cambios"}
      </BtnPrimary>
    </div>
  );
}
