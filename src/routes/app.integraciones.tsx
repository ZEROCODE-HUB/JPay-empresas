import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/portal-shell";
import { EcartPayCard } from "@/features/integraciones/components/EcartPayCard";
import { useComerciosCliente } from "@/hooks/useComercios";

type Busqueda = { ecartpay?: "conectado" | "error"; motivo?: string };

export const Route = createFileRoute("/app/integraciones")({
  validateSearch: (s: Record<string, unknown>): Busqueda => ({
    ecartpay: s.ecartpay === "conectado" || s.ecartpay === "error" ? s.ecartpay : undefined,
    motivo: typeof s.motivo === "string" ? s.motivo : undefined,
  }),
  head: () => ({ meta: [{ title: "Integraciones" }] }),
  component: Page,
});

function Page() {
  const { ecartpay, motivo } = Route.useSearch();
  const navigate = useNavigate();
  const { rows, isLoading } = useComerciosCliente();
  const comercios = rows ?? [];
  const [comercioId, setComercioId] = useState<string | null>(null);
  const actual = comercioId ?? comercios[0]?.id ?? null;

  // Resultado de la vuelta desde Ecart Pay: avisar y limpiar la URL.
  useEffect(() => {
    if (!ecartpay) return;
    if (ecartpay === "conectado") toast.success("Tu cuenta de Ecart Pay quedó conectada");
    else toast.error(`No se pudo conectar Ecart Pay${motivo ? `: ${motivo}` : ""}`);
    void navigate({ to: "/app/integraciones", search: {}, replace: true });
  }, [ecartpay, motivo, navigate]);

  return (
    <>
      <PageHeader
        title="Integraciones"
        description="Conectá las cuentas con las que cobrás tus ventas."
      />
      {isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : !actual ? (
        <Card className="text-sm">
          Tu cuenta todavía no tiene un comercio habilitado. Cuando el equipo de JPay lo dé de alta,
          vas a poder conectar tus medios de cobro desde acá.
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
          <EcartPayCard comercioId={actual} />
        </div>
      )}
    </>
  );
}
