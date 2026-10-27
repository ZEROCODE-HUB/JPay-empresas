import { FileUpload, WizardNav } from "@/features/onboarding/components";
import { getPais } from "@/shared/pais";
import type { KycWizard } from "../hooks/useKycWizard";

/** Pasos 1 a 3: documento de identidad del país (INE, DNI), comprobante de domicilio y selfie. */
export function PasosDocumentos({ w }: { w: KycWizard }) {
  const { step, setStep, files, setFiles, canNext } = w;
  const doc = getPais().documentoIdentidad;
  return (
    <>
      {step === 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-black-800">
            Cargá tu {doc} de frente y de reverso
          </h2>
          <FileUpload
            label={`${doc} frente`}
            value={files.dniFrente}
            onChange={(v) => setFiles({ ...files, dniFrente: v })}
          />
          <FileUpload
            label={`${doc} reverso`}
            value={files.dniDorso}
            onChange={(v) => setFiles({ ...files, dniDorso: v })}
          />
          <WizardNav onNext={() => setStep(1)} nextDisabled={!canNext} nextLabel="Siguiente" />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-black-800">
            Cargá un comprobante de domicilio a tu nombre
          </h2>
          <FileUpload
            label="Recibo de servicio (luz, agua, teléfono)"
            hint="Debe mostrar tu dirección y no tener más de 3 meses de antigüedad."
            value={files.servicio}
            onChange={(v) => setFiles({ ...files, servicio: v })}
          />
          <WizardNav
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
            nextDisabled={!canNext}
            nextLabel="Siguiente"
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-black-800">Cargá una selfie</h2>
          <FileUpload
            label="Selfie"
            hint="De frente, en un lugar bien iluminado, sin anteojos ni sombreros."
            value={files.selfie}
            onChange={(v) => setFiles({ ...files, selfie: v })}
            accept="image/*"
          />
          <WizardNav
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextDisabled={!canNext}
            nextLabel="Siguiente"
          />
        </div>
      )}
    </>
  );
}
