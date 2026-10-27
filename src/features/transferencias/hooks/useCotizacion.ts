import { useEffect, useRef, useState } from "react";
import { cotizarTransferencia, type Cotizacion } from "@/lib/api/transferencias";

/**
 * Cotiza contra la base (misma regla de comision que se cobra al enviar), con
 * debounce. Mientras llega la respuesta, `estimado` compara el monto contra el
 * disponible local para que la validacion sea inmediata.
 */
export function useCotizacion(
  subcuentaOrigen: string,
  monto: number,
  destino: string | null | undefined,
  disponible: number,
) {
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    if (!subcuentaOrigen || !(monto > 0)) {
      setCotizacion(null);
      setCargando(false);
      return;
    }
    const id = ++pedido.current;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const c = await cotizarTransferencia({ subcuentaOrigen, monto, destino });
        if (id === pedido.current) setCotizacion(c);
      } catch {
        if (id === pedido.current) setCotizacion(null);
      } finally {
        if (id === pedido.current) setCargando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [subcuentaOrigen, monto, destino]);

  // La cotizacion vieja no vale si cambio el monto u origen.
  const vigente =
    cotizacion && cotizacion.monto === Math.round(monto * 100) / 100 ? cotizacion : null;
  const excedeDisponible = monto > 0 && monto > disponible;
  const insuficiente = excedeDisponible || (vigente ? !vigente.alcanza : false);
  const faltante = vigente ? vigente.faltante : Math.max(monto - disponible, 0);

  return { cotizacion: vigente, cargando, insuficiente, faltante };
}
