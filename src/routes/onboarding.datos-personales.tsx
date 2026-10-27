import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AuthShell,
  Field,
  FormTitle,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  Stepper,
  WizardNav,
} from "@/components/onboarding";
import { OCUPACIONES, ORIGEN_FONDOS, useOnboarding } from "@/lib/onboarding-store";
import { pageTitle } from "@/brand/brand";

export const Route = createFileRoute("/onboarding/datos-personales")({
  head: () => ({
    meta: [
      { title: pageTitle("Validacion de datos personales") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DatosPersonales,
});

const STEPS = ["Datos personales", "Informacion financiera", "Validacion final"];

function DatosPersonales() {
  const nav = useNavigate();
  const { tipoCuenta, datosPersonales, setDatosPersonales } = useOnboarding();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    genero: datosPersonales.genero ?? "",
    cuitCuil: datosPersonales.cuitCuil ?? "",
    ocupacion: datosPersonales.ocupacion ?? "",
    origenFondos: datosPersonales.origenFondos ?? "",
    esPEP: datosPersonales.esPEP ?? false,
  });
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      try {
        const { requireSupabase } = await import("@/lib/supabase");
        const sb = requireSupabase();
        const { data: u } = await sb.auth.getUser();
        const mail = u.user?.email;
        if (!mail) return;
        // Protección: si el store persiste datos de otra cuenta en el mismo browser,
        // vaciarlo y reiniciar el formulario antes de que se pre-carge con esa data.
        const st = useOnboarding.getState();
        if (st.registro.email && st.registro.email !== mail) {
          st.reset();
          setF({ genero: "", cuitCuil: "", ocupacion: "", origenFondos: "", esPEP: false });
        }
        const { data: cli } = await sb.from("clientes").select("genero, cuit_cuil, ocupacion, origen_fondos, es_pep").eq("correo", mail).maybeSingle();
        if (!cli) return;
        setF((prev) => ({
          genero: prev.genero || (cli as any).genero || "",
          cuitCuil: prev.cuitCuil || (cli as any).cuit_cuil || "",
          ocupacion: prev.ocupacion || (cli as any).ocupacion || "",
          origenFondos: prev.origenFondos || (cli as any).origen_fondos || "",
          esPEP: prev.esPEP || !!(cli as any).es_pep,
        }));
      } catch { /* ignore */ }
    })();
  }, []);

  const cuitDigits = f.cuitCuil.replace(/\D/g, "");
  const cuitExcede = cuitDigits.length > 11;
  const validateStep0 = () => {
    const e: Record<string, string> = {};
    if (!f.genero) e.genero = "El genero es requerido";
    if (!f.cuitCuil.trim()) e.cuitCuil = "Ingresa tu CUIT/CUIL";
    else if (cuitExcede) e.cuitCuil = "Máximo 11 dígitos permitidos. Quita los excedentes.";
    else if (cuitDigits.length !== 11) e.cuitCuil = "El CUIT/CUIL debe tener exactamente 11 dígitos.";
    if (!f.ocupacion) e.ocupacion = "Selecciona una ocupacion";
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!f.origenFondos) e.origenFondos = "Selecciona el origen de fondos";
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (step === 0 && !validateStep0()) return;
    if (step === 1 && !validateStep1()) return;
    if (step === 2) {
      setDatosPersonales(f);
      if (tipoCuenta === "juridica") return nav({ to: "/onboarding/datos-empresa" });
      return nav({ to: "/onboarding/kyc" });
    }
    setStep(step + 1);
  };

  return (
    <AuthShell
      leftEyebrow="Paso 3 · Datos personales"
      leftTitle={tipoCuenta === "juridica" ? "Datos del representante legal." : "Completa tu perfil regulatorio."}
      leftBody="Estos datos son requeridos por normativa antilavado (UIF) y solo se comparten con las autoridades competentes."
      step={`Paso ${step + 1} de 3`}
    >
      <FormTitle eyebrow="KYC · Datos personales" title="Validacion de datos personales" />
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="space-y-4">
          <SelectField
            label="Genero"
            value={f.genero}
            onChange={(v) => setF({ ...f, genero: v })}
            options={["Femenino", "Masculino", "No binario", "Prefiero no responder"]}
            error={err.genero}
          />
          <Field
            label="CUIT / CUIL"
            value={f.cuitCuil}
            onChange={(e) => setF({ ...f, cuitCuil: e.target.value })}
            placeholder="20-12345678-9"
            className="font-mono"
            error={err.cuitCuil || (cuitExcede ? "Máximo 11 dígitos permitidos" : undefined)}
            hint={cuitDigits.length > 0 ? `${cuitDigits.length}/11 dígitos` : undefined}
          />
          <SelectField
            label="Ocupacion"
            value={f.ocupacion}
            onChange={(v) => setF({ ...f, ocupacion: v })}
            options={OCUPACIONES}
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
            options={ORIGEN_FONDOS}
            error={err.origenFondos}
          />
          <WizardNav onBack={() => setStep(0)} onNext={next} nextLabel="Siguiente" />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="p-5 text-xs leading-relaxed text-black-500 bg-black-50 border border-black-100 rounded-sm">
            Se consideran <strong>PEPs</strong> a los Funcionarios Públicos Nacionales, Provinciales y Municipales (tanto
            Nacionales como Extranjeros) de los Poderes Ejecutivo, Legislativo y Judicial, que ocupan o que ocuparon
            altos cargos jerárquicos, así como también a sus familiares hasta el segundo grado de consanguinidad. Los
            funcionarios calificados como PEPs continúan siéndolo hasta dos años después de haber cesado en sus
            funciones.
          </div>
          <label className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm font-semibold text-black-800">¿Es persona políticamente expuesta?</span>
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
            <SecondaryButton onClick={() => setStep(1)}>Atras</SecondaryButton>
            <div className="flex-1">
              <PrimaryButton onClick={next}>Siguiente paso</PrimaryButton>
            </div>
          </div>
        </div>
      )}
      <div className="text-center pt-4">
        <Link to="/login" className="text-xs text-black-400 hover:text-primary-ink underline underline-offset-2">Volver a inicio de sesión</Link>
      </div>
    </AuthShell>
  );
}
