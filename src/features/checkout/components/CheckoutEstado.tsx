import { AlertCircle, Loader2 } from "lucide-react";
import type { CheckoutStatus } from "../hooks/useCheckoutPago";
import { CenterCard } from "./CenterCard";

/** Pantallas de estado del link: cargando, no encontrado, inactivo, vencido y error. */
export function CheckoutEstado({ status }: { status: CheckoutStatus }) {
  return (
    <>
      {status === "loading" && (
        <CenterCard>
          <Loader2 className="animate-spin text-[color:var(--brand-primary-700)]" size={28} />
          <p className="text-sm text-muted-foreground mt-3">Cargando link de pago…</p>
        </CenterCard>
      )}

      {status === "notfound" && (
        <CenterCard>
          <AlertCircle className="text-muted-foreground" size={28} />
          <p className="font-semibold mt-3">Link no encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">El enlace no existe o fue removido.</p>
        </CenterCard>
      )}

      {status === "inactive" && (
        <CenterCard>
          <AlertCircle className="text-amber-500" size={28} />
          <p className="font-semibold mt-3">Link inactivo</p>
          <p className="text-xs text-muted-foreground mt-1">
            Este cobro no esta disponible en este momento.
          </p>
        </CenterCard>
      )}

      {status === "expired" && (
        <CenterCard>
          <AlertCircle className="text-danger-500" size={28} />
          <p className="font-semibold mt-3">Link vencido</p>
          <p className="text-xs text-muted-foreground mt-1">La fecha de pago expiró.</p>
        </CenterCard>
      )}

      {status === "error" && (
        <CenterCard>
          <AlertCircle className="text-danger-500" size={28} />
          <p className="font-semibold mt-3">No pudimos cargar el link</p>
          <p className="text-xs text-muted-foreground mt-1">Intenta nuevamente mas tarde.</p>
        </CenterCard>
      )}
    </>
  );
}
