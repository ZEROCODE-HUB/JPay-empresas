import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AuthShell,
  FormTitle,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  Stepper,
  WizardNav,
} from "@/features/onboarding/components";
import { CampoIdentificador, SelectRegimen } from "@/features/onboarding/components/identificacion";
import { useOnboarding, type DatosPersonales as Datos } from "@/lib/onboarding-store";
import { pageTitle } from "@/brand/brand";
import { useDatosPersonalesGuardados } from "@/hooks/useOnboarding";
import { getPais } from "@/shared/pais";

export const Route = createFileRoute("/onboarding/datos-personales")({
  head: () => ({
    meta: [
      { title: pageTitle("Validación de datos personales") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DatosPersonales,
});

const STEPS = ["Datos personales", "Información financiera", "Validación final"];

const VACIO: Datos = {
  genero: "",
  taxId: "",
  idPersonal: "",
  regimenFiscal: "",
  cuentaBancaria: "",
  ocupacion: "",
  origenFondos: "",
  esPEP: false,
};

function DatosPersonales() {
  const nav = useNavigate();
  const pais = getPais();
  const { tipoCuenta, datosPersonales, setDatosPersonales } = useOnboarding();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Datos>({ ...VACIO, ...datosPersonales });
  const [err, setErr] = useState<Record<string, string>>({});
  const { data: guardados } = useDatosPersonalesGuardados();
  useEffect(() => {
    if (!guardados) return;
    const { email: mail, cliente: cli } = guardados;
    // Protección: si el store persiste datos de otra cuenta en el mismo browser,
    // vaciarlo y reiniciar el formulario antes de que se pre-carge con esa data.
    const st = useOnboarding.getState();
    if (st.registro.email && st.registro.email !== mail) {
      st.reset();
      setF(VACIO);
    }
    if (!cli) return;
    setF((prev) => ({
      genero: prev.genero || cli.genero || "",
      taxId: prev.taxId || cli.tax_id || cli.cuit_cuil || "",
      idPersonal: prev.idPersonal || cli.id_personal || "",
      regimenFiscal: prev.regimenFiscal || cli.regimen_fiscal || "",
      cuentaBancaria: prev.cuentaBancaria || cli.cuenta_bancaria || "",
      ocupacion: prev.ocupacion || cli.ocupacion || "",
      origenFondos: prev.origenFondos || cli.origen_fondos || "",
      esPEP: prev.esPEP || !!cli.es_pep,
    }));
  }, [guardados]);

  const fiscal = pais.fiscal.fisica;
  const validateStep0 = () => {
    const e: Record<string, string> = {};
    if (!f.genero) e.genero = "El género es requerido";
    const errFiscal = fiscal.validar(f.taxId);
    if (errFiscal) e.taxId = errFiscal;
    const errPersonal = pais.personal?.validar(f.idPersonal);
    if (errPersonal) e.idPersonal = errPersonal;
    if (pais.regimenesFiscales.length && !f.regimenFiscal) e.regimenFiscal = "Requerido";
    if (!f.ocupacion) e.ocupacion = "Selecciona una ocupación";
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!f.origenFondos) e.origenFondos = "Selecciona el origen de fondos";
    // La cuenta es opcional, pero si se carga tiene que ser válida.
    const errCuenta = f.cuentaBancaria.trim()
      ? pais.cuentaBancaria.validar(f.cuentaBancaria)
      : null;
    if (errCuenta) e.cuentaBancaria = errCuenta;
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (step === 0 && !validateStep0()) return;
    if (step === 1 && !validateStep1()) return;
    if (step === 2) {
      setDatosPersonales({
        ...f,
        taxId: fiscal.normalizar(f.taxId),
        idPersonal: pais.personal ? pais.personal.normalizar(f.idPersonal) : "",
        cuentaBancaria: pais.cuentaBancaria.normalizar(f.cuentaBancaria),
      });
      if (tipoCuenta === "juridica") return nav({ to: "/onboarding/datos-empresa" });
      return nav({ to: "/onboarding/kyc" });
    }
    setStep(step + 1);
  };

  return (
    <AuthShell
      leftEyebrow="Paso 3 · Datos personales"
      leftTitle={
        tipoCuenta === "juridica"
          ? "Datos del representante legal."
          : "Completa tu perfil regulatorio."
      }
      leftBody={pais.textos.normativaPld}
      step={`Paso ${step + 1} de 3`}
    >
      <FormTitle eyebrow="KYC · Datos personales" title="Validación de datos personales" />
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="space-y-4">
          <SelectField
            label="Género"
            value={f.genero}
            onChange={(v) => setF({ ...f, genero: v })}
            options={["Femenino", "Masculino", "No binario", "Prefiero no responder"]}
            error={err.genero}
          />
          <CampoIdentificador
            id={fiscal}
            value={f.taxId}
            onChange={(v) => setF({ ...f, taxId: v })}
            error={err.taxId}
          />
          {pais.personal && (
            <CampoIdentificador
              id={pais.personal}
              value={f.idPersonal}
              onChange={(v) => setF({ ...f, idPersonal: v })}
              error={err.idPersonal}
            />
          )}
          <SelectRegimen
            persona="fisica"
            value={f.regimenFiscal}
            onChange={(v) => setF({ ...f, regimenFiscal: v })}
            error={err.regimenFiscal}
          />
          <SelectField
            label="Ocupación"
            value={f.ocupacion}
            onChange={(v) => setF({ ...f, ocupacion: v })}
            options={pais.ocupaciones}
            error={err.ocupacion}
          />
          <WizardNav onNext={next} nextLabel="Siguiente" />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <SelectField
            label="Origen de fondos"
            value={f.origenFondos}
            onChange={(v) => setF({ ...f, origenFondos: v })}
            options={pais.origenFondos}
            error={err.origenFondos}
          />
          {tipoCuenta !== "juridica" && (
            <CampoIdentificador
              id={pais.cuentaBancaria}
              opcional
              value={f.cuentaBancaria}
              onChange={(v) => setF({ ...f, cuentaBancaria: v })}
              error={err.cuentaBancaria}
            />
          )}
          <WizardNav onBack={() => setStep(0)} onNext={next} nextLabel="Siguiente" />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="p-5 text-xs leading-relaxed text-black-500 bg-black-50 border border-black-100 rounded-sm">
            {pais.textos.pep}
          </div>
          <label className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm font-semibold text-black-800">
              ¿Es persona políticamente expuesta?
            </span>
            <button
              type="button"
              onClick={() => setF({ ...f, esPEP: !f.esPEP })}
              role="switch"
              aria-checked={f.esPEP}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                f.esPEP ? "bg-primary-500" : "bg-black-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  f.esPEP ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <SecondaryButton onClick={() => setStep(1)}>Atrás</SecondaryButton>
            <div className="flex-1">
              <PrimaryButton onClick={next}>Siguiente paso</PrimaryButton>
            </div>
          </div>
        </div>
      )}
      <div className="text-center pt-4">
        <Link
          to="/login"
          className="text-xs text-black-400 hover:text-primary-ink underline underline-offset-2"
        >
          Volver a inicio de sesión
        </Link>
      </div>
    </AuthShell>
  );
}
