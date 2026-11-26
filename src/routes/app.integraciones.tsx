import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/portal-shell";
import { CuentaSpeiCard } from "@/features/integraciones/components/CuentaSpeiCard";
import { EcartPayCard } from "@/features/integraciones/components/EcartPayCard";
import { PasarelaApagadaAviso } from "@/features/integraciones/components/PasarelaApagadaAviso";
import { useComerciosCliente } from "@/hooks/useComercios";
import { usePaisConModulos } from "@/shared/modulos-pais";
import { EmptyState } from "@/shared/ui/empty-state";
import { brand } from "@/brand/brand";
import { Cargando, ErrorCarga } from "@/shared/ui/estado-carga";

type Busqueda = { ecartpay?: "conectado" | "error"; motivo?: string };

export const Route = createFileRoute("/app/integraciones")({
  validateSearch: (s: Record<string, unknown>): Busqueda => ({
    ecartpay: s.ecartpay === "conectado" || s.ecartpay === "error" ? s.ecartpay : undefined,
    motivo: typeof s.motivo === "string" ? s.motivo : undefined,
  }),
  head: () => ({ meta: [{ title: "Conexiones" }] }),
  component: Page,
});

function Page() {
  const { ecartpay } = Route.useSearch();
  const navigate = useNavigate();
  const pais = usePaisConModulos();
  const { rows, isLoading, error, refetch } = useComerciosCliente();
  const comercios = rows ?? [];
  const [comercioId, setComercioId] = useState<string | null>(null);
  const actual = comercioId ?? comercios[0]?.id ?? null;

  // Resultado de la vuelta desde la página del procesador de pagos: avisar y limpiar la URL.
  // (El motivo técnico no se muestra al cliente: queda registrado para soporte.)
  useEffect(() => {
    if (!ecartpay) return;
    if (ecartpay === "conectado") toast.success("Tus cobros con tarjeta quedaron activos");
    else
      toast.error(
        "No se pudo vincular tu cuenta de cobros. Inténtalo de nuevo o contacta a soporte.",
      );
    void navigate({ to: "/app/integraciones", search: {}, replace: true });
  }, [ecartpay, navigate]);

  return (
    <>
      <PageHeader
        title="Conexiones"
        description="Los servicios de tu cuenta y su estado. Lo que cobras con tarjeta lo ves en Cobrar › Cobros con tarjeta."
      />
      {pais.modulos.transferencias_cobre && (
        <div className="mb-4">
          <CuentaSpeiCard />
        </div>
      )}
      {isLoading ? (
        <Cargando className="block h-40 w-full" />
      ) : error ? (
        <ErrorCarga error={error} onRetry={refetch} />
      ) : !actual ? (
        <Card>
          <EmptyState
            icon={<Plug size={48} strokeWidth={1.5} />}
            title="Cobros con tarjeta: todavía no tienes un comercio habilitado"
            description={`Se habilita en cuanto ${brand.name} aprueba la verificación de tu cuenta. Después podrás activar tus cobros desde aquí.`}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {comercios.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              Comercio
              <select
                className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                value={actual}
                onChange={(e) => setComercioId(e.target.value)}
              >
                {comercios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre_comercio ?? c.legajo}
                  </option>
                ))}
              </select>
            </label>
          )}
          <PasarelaApagadaAviso comercioId={actual} />
          <EcartPayCard comercioId={actual} />
        </div>
      )}
    </>
  );
}
