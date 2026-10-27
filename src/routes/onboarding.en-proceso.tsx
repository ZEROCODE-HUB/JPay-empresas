import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AuthShell,
  PrimaryButton,
  SecondaryButton,
  SuccessCard,
} from "@/features/onboarding/components";
import { useEstadoOnboarding } from "@/hooks/useOnboarding";
import { ESTADO_LABEL, normalizarEstado, siguientePasoOnboarding } from "@/lib/cliente-estados";
import { brand, pageTitle, mailto } from "@/brand/brand";

export const Route = createFileRoute("/onboarding/en-proceso")({
  head: () => ({
    meta: [{ title: pageTitle("Solicitud enviada") }, { name: "robots", content: "noindex" }],
  }),
  component: EnProceso,
});

function EnProceso() {
  const nav = useNavigate();
  const { data, isLoading: loading } = useEstadoOnboarding();
  const estado = data?.estado ?? null;
  const hasDocs = data?.hasDocs ?? null;

  const norm = estado ? normalizarEstado(estado) : null;
  const label = norm ? ESTADO_LABEL[norm] : "En proceso";
  const paso = norm
    ? siguientePasoOnboarding(norm)
    : "Tu alta fue registrada y esta siendo validada por nuestro equipo de compliance.";

  if (loading) {
    return (
      <AuthShell
        leftEyebrow="Paso 6 · Revision"
        leftTitle="Cargando tu estado..."
        leftBody="Consultando el estado de tu solicitud."
        step="Cargando..."
      >
        <SuccessCard
          variant="loading"
          title="Cargando..."
          body={<p>Un momento, estamos verificando tu estado.</p>}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      leftEyebrow="Paso 6 · Revision"
      leftTitle="Tu solicitud fue enviada."
      leftBody={paso}
      step={label}
    >
      <SuccessCard
        variant={
          norm === "deshabilitado" || norm === "eliminado"
            ? "error"
            : norm === "activado"
              ? "success"
              : "info"
        }
        title={norm ? label : "Solicitud enviada"}
        body={
          <>
            <p>
              {norm === "pendiente_verificacion" && "Verifica tu correo para pasar a Registrado."}
              {norm === "registrado" &&
                "Tu documentacion esta en revision. Permaneceras en Registrado hasta que Admin apruebe."}
              {norm === "preactivado" &&
                "Documentacion aprobada (Preactivado). Falta generar tu CBU y cargar tu comision para activar."}
              {norm === "activado" && "Tu cuenta ya esta Activada. Podes operar."}
              {norm === "suspendido" &&
                "Tu cuenta esta Suspendida temporalmente. Contacta a soporte."}
              {norm === "deshabilitado" &&
                "Tu cuenta fue Deshabilitada. CBU cancelado, historial conservado para auditoria BCRA."}
              {norm === "eliminado" && "Tu cuenta fue Eliminada."}
              {!norm &&
                "Tu alta fue registrada y esta siendo validada por nuestro equipo de compliance. Este proceso puede demorar hasta 24 horas habiles. Te avisaremos por correo cuando quede habilitada."}
            </p>
            <p className="mt-3 text-xs text-black-400">
              Si tenés algún problema,{" "}
              <a
                href={mailto(brand.contact.support)}
                className="underline underline-offset-2 hover:text-primary-ink"
              >
                contactanos
              </a>
              .
            </p>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => nav({ to: norm === "activado" ? "/app" : "/login" })}>
            {norm === "activado" ? "Ir al dashboard" : "Ir a iniciar sesion"}
          </PrimaryButton>
          {norm === "registrado" && hasDocs && (
            <SecondaryButton onClick={() => nav({ to: "/onboarding/datos-personales" })}>
              Editar información y reenviar
            </SecondaryButton>
          )}
          {norm === "pendiente_verificacion" && (
            <SecondaryButton onClick={() => nav({ to: "/login" })}>
              Reenviar verificación
            </SecondaryButton>
          )}
        </div>
      </SuccessCard>
    </AuthShell>
  );
}
