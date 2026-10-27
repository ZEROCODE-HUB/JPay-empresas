import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell, FormTitle, Stepper } from "@/features/onboarding/components";
import { pageTitle } from "@/brand/brand";
import { PasoDomicilio } from "@/features/onboarding/kyc/components/PasoDomicilio";
import { PasosDocumentos } from "@/features/onboarding/kyc/components/PasosDocumentos";
import { useKycWizard } from "@/features/onboarding/kyc/hooks/useKycWizard";
import { pasosKyc } from "@/features/onboarding/kyc/utils";
import { getPais } from "@/shared/pais";

export const Route = createFileRoute("/onboarding/kyc")({
  head: () => ({
    meta: [{ title: pageTitle("Validacion KYC") }, { name: "robots", content: "noindex" }],
  }),
  component: KycWizard,
});

function KycWizard() {
  const w = useKycWizard();
  const { step } = w;
  const pais = getPais();

  return (
    <AuthShell
      leftEyebrow="Paso 5 · Verificacion de identidad"
      leftTitle="Validamos tu identidad de forma segura."
      leftBody={pais.textos.normativaDocumentos}
      step={`Paso ${step + 1} de 4`}
    >
      <FormTitle eyebrow="KYC · Documentacion" title="Validacion KYC" />
      <Stepper steps={pasosKyc(pais.documentoIdentidad)} current={step} />

      <PasosDocumentos w={w} />

      {step === 3 && <PasoDomicilio w={w} />}
      {step < 3 && (
        <div className="text-center pt-4">
          <Link
            to="/login"
            className="text-xs text-black-400 hover:text-primary-ink underline underline-offset-2"
          >
            Volver a inicio de sesión
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
