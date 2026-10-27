import { FileUpload, WizardNav } from "@/features/onboarding/components";
import type { KycWizard } from "../hooks/useKycWizard";

/** Pasos 1 a 3: DNI, servicio y selfie. */
export function PasosDocumentos({ w }: { w: KycWizard }) {
  const { step, setStep, files, setFiles, canNext } = w;
  return (
    <>
      {step === 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-black-800">Cargá el DNI frente y dorso</h2>
          <FileUpload
            label="DNI frente"
            value={files.dniFrente}
            onChange={(v) => setFiles({ ...files, dniFrente: v })}
          />
          <FileUpload
            label="DNI dorso"
            value={files.dniDorso}
            onChange={(v) => setFiles({ ...files, dniDorso: v })}
          />
          <WizardNav onNext={() => setStep(1)} nextDisabled={!canNext} nextLabel="Siguiente" />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-black-800">Cargá un servicio a tu nombre</h2>
          <FileUpload
            label="Factura de servicio"
            hint="Debe contener tu direccion y no debe tener mas de 3 meses de antigüedad."
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
