import { toast } from "sonner";
import { BtnPrimary, Card } from "@/components/portal-shell";
import {
  useActivarPasarelaEcart,
  useConexionEcartPay,
  usePasarelaEcart,
} from "@/hooks/useIntegraciones";
import { mensajeError } from "@/shared/errores";

/**
 * Aviso cuando la pasarela propia de Ecart Pay está apagada en la cuenta del comercio: así no se
 * puede cobrar (links de pago y suscripciones muestran «no hay métodos de pago activos»).
 * Un clic la prende. No muestra nada si está prendida o si el comercio no está conectado.
 */
export function PasarelaApagadaAviso({ comercioId }: { comercioId: string | null }) {
  const conexion = useConexionEcartPay(comercioId);
  const conectado = conexion.data?.estado === "conectado";
  const pasarela = usePasarelaEcart(comercioId, conectado);
  const activar = useActivarPasarelaEcart(comercioId);

  const p = pasarela.data;
  if (!conectado || !p || p.activa) return null;

  const prender = () =>
    activar.mutate(undefined, {
      onSuccess: (r) =>
        r?.activa
          ? toast.success("Listo: ya puedes cobrar con tarjeta")
          : toast.error("No se confirmó la activación; inténtalo de nuevo en un momento"),
      onError: (e) => toast.error(mensajeError(e)),
    });

  return (
    <Card className="mb-4 border-warning bg-warning-bg">
      <h2 className="font-semibold">Tus cobros con tarjeta están apagados</h2>
      <p className="mt-1 text-sm text-black-500">
        Mientras estén apagados, tus clientes no pueden pagar tus links de pago ni agregar su
        tarjeta a una suscripción.
      </p>
      <BtnPrimary className="mt-3" onClick={prender} disabled={activar.isPending}>
        {activar.isPending ? "Activando…" : "Activar"}
      </BtnPrimary>
    </Card>
  );
}
