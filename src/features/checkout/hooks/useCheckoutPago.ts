import { useEffect, useState } from "react";
import type { CheckoutLink } from "@/lib/api/checkout";
import { useCheckoutLink } from "@/hooks/useCheckout";
import { totalLink } from "../utils";

export type CheckoutStatus = "loading" | "ready" | "notfound" | "inactive" | "expired" | "error";

/**
 * Estado del checkout público (`/p/$code`): el link, su estado y el monto a pagar. El cobro
 * en sí lo hacen las tarjetas de Ecart Pay y de SPEI con Cobre.
 */
export function useCheckoutPago(code: string) {
  const linkQuery = useCheckoutLink(code);
  const resultado = linkQuery.data;
  const status: CheckoutStatus = linkQuery.isError
    ? "error"
    : !resultado
      ? "loading"
      : resultado.estado;
  const data: CheckoutLink | null =
    resultado && resultado.estado !== "notfound" ? resultado.link : null;
  const [montoPagar, setMontoPagar] = useState<string>("");

  // Al resolver el link se propone el monto total.
  useEffect(() => {
    if (resultado?.estado !== "ready") return;
    setMontoPagar(totalLink(resultado.link).toFixed(2));
  }, [resultado]);

  return {
    status,
    data,
    montoPagar,
    setMontoPagar,
    total: data ? totalLink(data) : 0,
  };
}

export type CheckoutPago = ReturnType<typeof useCheckoutPago>;
