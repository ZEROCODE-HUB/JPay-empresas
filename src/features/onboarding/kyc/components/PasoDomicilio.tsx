import { Link } from "@tanstack/react-router";
import { Field, SelectField, WizardNav } from "@/features/onboarding/components";
import { PROVINCIAS } from "@/lib/onboarding-store";
import type { KycWizard } from "../hooks/useKycWizard";

/** Paso 4: domicilio de residencia y envío del alta. */
export function PasoDomicilio({ w }: { w: KycWizard }) {
  const { setStep, addr, setAddr, err, submitError, submitting, finish } = w;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-black-800">Domicilio de residencia</h2>
      <Field
        label="Direccion"
        value={addr.direccion}
        onChange={(e) => setAddr({ ...addr, direccion: e.target.value })}
        error={err.direccion}
      />
      <Field
        label="Direccion (opcional)"
        value={addr.direccion2}
        onChange={(e) => setAddr({ ...addr, direccion2: e.target.value })}
        placeholder="Piso, departamento, referencia"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Ciudad"
          value={addr.ciudad}
          onChange={(e) => setAddr({ ...addr, ciudad: e.target.value })}
          error={err.ciudad}
        />
        <SelectField
          label="Provincia"
          value={addr.provincia}
          onChange={(v) => setAddr({ ...addr, provincia: v })}
          options={PROVINCIAS}
          error={err.provincia}
        />
      </div>
      <Field
        label="Codigo postal"
        value={addr.cp}
        onChange={(e) => setAddr({ ...addr, cp: e.target.value })}
        error={err.cp}
      />
      {submitError && <p className="text-sm text-danger-600">{submitError}</p>}
      <WizardNav
        onBack={() => setStep(2)}
        onNext={finish}
        nextLabel={submitting ? "Enviando..." : "Finalizar"}
        nextDisabled={submitting}
      />
      <div className="text-center pt-2">
        <Link
          to="/login"
          className="text-xs text-black-400 hover:text-primary-ink underline underline-offset-2"
        >
          Volver a inicio de sesión
        </Link>
      </div>
    </div>
  );
}
