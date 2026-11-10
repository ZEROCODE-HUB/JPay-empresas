import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Card, PageHeader } from "@/components/portal-shell";
import { useComerciosCliente } from "@/hooks/useComercios";
import { useConexionEcartPay } from "@/hooks/useIntegraciones";

/**
 * Candado de las pantallas que usan Ecart Pay: espera el comercio del cliente y su conexión, y si
 * no está conectado muestra el encabezado con el aviso para conectarlo en Conexiones. Con la
 * conexión lista, renderiza `children` con el id del comercio (el contenido arma su encabezado).
 */
export function RequiereEcartPay({
  titulo,
  descripcion,
  aviso = "Primero activa los cobros con tarjeta en",
  children,
}: {
  titulo: string;
  descripcion?: string;
  /** Texto antes del link a Conexiones. */
  aviso?: string;
  children: (comercioId: string) => ReactNode;
}) {
  const { rows, isLoading: cargandoComercios } = useComerciosCliente();
  const comercioId = rows?.[0]?.id ?? null;
  const conexion = useConexionEcartPay(comercioId);
  const conectado = conexion.data?.estado === "conectado";

  if (comercioId && conectado) return <>{children(comercioId)}</>;

  return (
    <>
      <PageHeader title={titulo} description={descripcion} />
      {cargandoComercios || conexion.isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : (
        <Card className="text-sm">
          {aviso}{" "}
          <Link to="/app/integraciones" className="font-semibold text-secondary hover:underline">
            Conexiones
          </Link>
          .
        </Card>
      )}
    </>
  );
}
