import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Card, PageHeader } from "@/components/portal-shell";
import { ConvertirCard } from "@/features/dolares/components/ConvertirCard";
import { ConversionesCard } from "@/features/dolares/components/MovimientosDolares";
import { SaldosDolaresCard } from "@/features/dolares/components/SaldosDolaresCard";
import { CONVERSION_EN_CURSO } from "@/features/dolares/estados";
import { useCuentaSpei, useDolares } from "@/hooks/useCobre";

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
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">
          No se pudo cargar: {(error as Error).message}
        </Card>
      ) : (
        <div className="space-y-4">
          <SaldosDolaresCard
            subcuentas={subcuentas.data ?? []}
            conversiones={conversiones.data ?? []}
          />
          <ConvertirCard subcuentas={subcuentas.data ?? []} habilitada={habilitada} />
          <ConversionesCard conversiones={conversiones.data ?? []} />
        </div>
      )}
    </>
  );
}
