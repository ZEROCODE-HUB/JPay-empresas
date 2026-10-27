import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AuthShell,
  Field,
  FormTitle,
  SelectField,
  Stepper,
  WizardNav,
} from "@/features/onboarding/components";
import { CampoIdentificador, SelectRegimen } from "@/features/onboarding/components/identificacion";
import { useOnboarding, type DatosEmpresa as Datos } from "@/lib/onboarding-store";
import { pageTitle } from "@/brand/brand";
import { useDatosEmpresaGuardados } from "@/hooks/useOnboarding";
import { formatDate } from "@/shared/format";
import { getPais } from "@/shared/pais";

export const Route = createFileRoute("/onboarding/datos-empresa")({
  head: () => ({
    meta: [{ title: pageTitle("Datos de la empresa") }, { name: "robots", content: "noindex" }],
  }),
  component: DatosEmpresa,
});

const STEPS = ["Datos de la empresa", "Confirmación"];

function DatosEmpresa() {
  const nav = useNavigate();
  const pais = getPais();
  const fiscal = pais.fiscal.moral;
  const { datosEmpresa, setDatosEmpresa } = useOnboarding();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Datos>({
    taxId: "",
    regimenFiscal: "",
    cuentaBancaria: "",
    fechaInscripcion: "",
    tipoId: "",
    nombreLegal: "",
    nombreFantasia: "",
    ...datosEmpresa,
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const { data: cli } = useDatosEmpresaGuardados();
  useEffect(() => {
    if (!cli) return;
    // No sobrescribir si ya hay valor en store (edición fresca). El `cuit` con prefijo 99
    // es el número interno provisorio, no un identificador fiscal.
    const cuitReal = cli.cuit && !cli.cuit.startsWith("99") ? cli.cuit : "";
    setF((prev) => ({
      taxId: prev.taxId || cli.tax_id || cuitReal,
      regimenFiscal: prev.regimenFiscal || cli.regimen_fiscal || "",
      cuentaBancaria: prev.cuentaBancaria || cli.cuenta_bancaria || "",
      fechaInscripcion: prev.fechaInscripcion || cli.fecha_inscripcion || "",
      tipoId: prev.tipoId || cli.tipo_sociedad || "",
      nombreLegal: prev.nombreLegal || cli.nombre_legal || "",
      nombreFantasia: prev.nombreFantasia || cli.nombre_fantasia || "",
    }));
  }, [cli]);

  const validate = () => {
    const e: Record<string, string> = {};
    const errFiscal = fiscal.validar(f.taxId);
    if (errFiscal) e.taxId = errFiscal;
    if (pais.regimenesFiscales.length && !f.regimenFiscal) e.regimenFiscal = "Requerido";
    const errCuenta = f.cuentaBancaria.trim()
      ? pais.cuentaBancaria.validar(f.cuentaBancaria)
      : null;
    if (errCuenta) e.cuentaBancaria = errCuenta;
    if (!f.fechaInscripcion) e.fechaInscripcion = "Requerido";
    if (!f.tipoId) e.tipoId = "Requerido";
    if (!f.nombreLegal.trim()) e.nombreLegal = "Requerido";
    if (!f.nombreFantasia.trim()) e.nombreFantasia = "Requerido";
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const regimen = pais.regimenesFiscales.find((r) => r.codigo === f.regimenFiscal);
  const rows = [
    [fiscal.etiqueta, fiscal.normalizar(f.taxId)],
    ...(pais.regimenesFiscales.length ? [["Régimen fiscal", regimen?.nombre ?? ""]] : []),
    [pais.cuentaBancaria.etiqueta, pais.cuentaBancaria.normalizar(f.cuentaBancaria)],
    ["Fecha de constitución", f.fechaInscripcion ? formatDate(f.fechaInscripcion) : ""],
    ["Tipo de sociedad", f.tipoId],
    ["Razón social", f.nombreLegal],
    ["Nombre comercial", f.nombreFantasia],
  ];

  return (
    <AuthShell
      leftEyebrow="Paso 4 · Empresa"
      leftTitle="Carga los datos societarios."
      leftBody="Reconstituimos tu legajo con la información que consta en el Registro Público de Comercio."
      step={`Paso ${step + 1} de 2`}
    >
      <FormTitle eyebrow="KYB · Empresa" title="Validación de datos de la empresa" />
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="space-y-4">
          <CampoIdentificador
            id={fiscal}
            value={f.taxId}
            onChange={(v) => setF({ ...f, taxId: v })}
            error={err.taxId}
          />
          <SelectRegimen
            persona="moral"
            value={f.regimenFiscal}
            onChange={(v) => setF({ ...f, regimenFiscal: v })}
            error={err.regimenFiscal}
          />
          <Field
            label="Fecha de constitución"
            type="date"
            value={f.fechaInscripcion}
            onChange={(e) => setF({ ...f, fechaInscripcion: e.target.value })}
            error={err.fechaInscripcion}
          />
          <SelectField
            label="Tipo de sociedad"
            value={f.tipoId}
            onChange={(v) => setF({ ...f, tipoId: v })}
            options={pais.tiposSociedad}
            error={err.tipoId}
          />
          <Field
            label="Razón social"
            value={f.nombreLegal}
            onChange={(e) => setF({ ...f, nombreLegal: e.target.value })}
            error={err.nombreLegal}
          />
          <Field
            label="Nombre comercial"
            value={f.nombreFantasia}
            onChange={(e) => setF({ ...f, nombreFantasia: e.target.value })}
            error={err.nombreFantasia}
          />
          <CampoIdentificador
            id={pais.cuentaBancaria}
            opcional
            value={f.cuentaBancaria}
            onChange={(v) => setF({ ...f, cuentaBancaria: v })}
            error={err.cuentaBancaria}
          />
          <WizardNav
            onNext={() => {
              if (validate()) setStep(1);
            }}
            nextLabel="Siguiente"
          />
          <VolverLogin />
        </div>
      )}

      {step === 1 && (
        <div>
          <p className="mb-2 text-[0.7rem] tracking-[0.2em] uppercase text-primary-ink">Resumen</p>
          <h2 className="mb-6 text-[1.35rem] font-semibold text-black-800">
            Confirma los datos ingresados
          </h2>
          <dl className="divide-y border-t border-b border-black-100">
            {rows.map(([k, v]) => (
              <div
                key={k}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,140px)_1fr] gap-1 sm:gap-4 py-3 text-sm"
              >
                <dt className="text-black-400">{k}</dt>
                <dd className="text-black-800 font-semibold">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <WizardNav
            onBack={() => setStep(0)}
            onNext={() => {
              setDatosEmpresa({
                ...f,
                taxId: fiscal.normalizar(f.taxId),
                cuentaBancaria: pais.cuentaBancaria.normalizar(f.cuentaBancaria),
              });
              nav({ to: "/onboarding/kyc" });
            }}
            nextLabel="Registrar empresa"
          />
          <VolverLogin />
        </div>
      )}
    </AuthShell>
  );
}

function VolverLogin() {
  return (
    <div className="text-center pt-2">
      <Link
        to="/login"
        className="text-xs text-black-400 hover:text-primary-ink underline underline-offset-2"
      >
        Volver a inicio de sesión
      </Link>
    </div>
  );
}
