import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { requireSupabase } from "@/lib/supabase";
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
  const [conSesion, setConSesion] = useState(false);
  useEffect(() => {
    requireSupabase()
      .auth.getSession()
      .then(({ data }) => setConSesion(!!data.session))
      .catch(() => setConSesion(false));
  }, []);
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
        {conSesion ? (
          <PrimaryButton onClick={() => nav({ to: "/onboarding/datos-personales" })}>
            Continuar con el alta
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => nav({ to: "/login" })}>Ir a inicio de sesión</PrimaryButton>
        )}
      </SuccessCard>
    </AuthShell>
  );
}
