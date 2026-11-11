import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageHeader } from "@/components/portal-shell";
import { ConvertirCard } from "@/features/dolares/components/ConvertirCard";
import { ConversionesCard } from "@/features/dolares/components/MovimientosDolares";
import { SaldosDolaresCard } from "@/features/dolares/components/SaldosDolaresCard";
import { CONVERSION_EN_CURSO } from "@/features/dolares/estados";
import { useCuentaSpei, useDolares } from "@/hooks/useCobre";
import { Cargando, ErrorCarga, EstadoConsulta } from "@/shared/ui/estado-carga";

export const Route = createFileRoute("/app/dolares")({
  head: () => ({ meta: [{ title: "Dólares" }] }),
  component: Page,
});

function Page() {
  const { cuenta, subcuentas } = useCuentaSpei();
  const { conversiones } = useDolares();
  const error = cuenta.error ?? subcuentas.error;
  // Los dólares son por la cuenta de JPay: un comercio con instancia Cobre propia no los usa aquí.
  const habilitada = !!cuenta.data?.cuenta && !cuenta.data.instanciaPropia;
  // Mientras haya conversiones en proceso, los saldos se refrescan solos; y una vez más cuando
  // terminan (los pesos apartados salen y los dólares entran a la subcuenta USD).
  const enCurso = (conversiones.data ?? []).filter((c) =>
    CONVERSION_EN_CURSO.includes(c.estado),
  ).length;
  const refetchSubcuentas = subcuentas.refetch;
  useEffect(() => {
    void refetchSubcuentas();
    if (enCurso === 0) return;
    const t = setInterval(() => void refetchSubcuentas(), 5_000);
    return () => clearInterval(t);
  }, [enCurso, refetchSubcuentas]);
  return (
    <>
      <PageHeader
        title="Dólares"
        description="Convierte pesos a dólares. Para pagar a cuentas en Estados Unidos o en otros países, usa Enviar › Envíos en dólares."
      />
      {cuenta.isLoading || subcuentas.isLoading ? (
        <Cargando className="block h-40 w-full" />
      ) : error ? (
        <ErrorCarga
          error={error}
          onRetry={() => void Promise.all([cuenta.refetch(), subcuentas.refetch()])}
        />
      ) : (
        <div className="space-y-4">
          {/* Sin las conversiones no se sabe qué está «por recibir»: espera a tenerlas. */}
          <EstadoConsulta q={conversiones} alto="h-28">
            {(c) => <SaldosDolaresCard subcuentas={subcuentas.data ?? []} conversiones={c} />}
          </EstadoConsulta>
          <ConvertirCard subcuentas={subcuentas.data ?? []} habilitada={habilitada} />
          <EstadoConsulta q={conversiones}>
            {(c) => <ConversionesCard conversiones={c} />}
          </EstadoConsulta>
        </div>
      )}
    </>
  );
}
