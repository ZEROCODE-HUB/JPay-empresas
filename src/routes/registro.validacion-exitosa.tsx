import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthShell, PrimaryButton, SuccessCard } from "@/features/onboarding/components";
import { pageTitle } from "@/brand/brand";

export const Route = createFileRoute("/registro/validacion-exitosa")({
  head: () => ({
    meta: [{ title: pageTitle("Correo validado") }, { name: "robots", content: "noindex" }],
  }),
  component: ValidacionExitosa,
});

function ValidacionExitosa() {
  const nav = useNavigate();
  return (
    <AuthShell
      leftEyebrow="Paso 2 · Verificacion"
      leftTitle="Tu correo quedo verificado."
      step="Cuenta habilitada"
    >
      <SuccessCard
        title="Validacion exitosa"
        body={<p>Tu correo electronico ha sido validado con exito.</p>}
      >
        <PrimaryButton onClick={() => nav({ to: "/login" })}>Ir a inicio de sesion</PrimaryButton>
      </SuccessCard>
    </AuthShell>
  );
}
