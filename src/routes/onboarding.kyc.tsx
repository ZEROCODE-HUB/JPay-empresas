import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AuthShell,
  Field,
  FileUpload,
  FormTitle,
  SelectField,
  Stepper,
  WizardNav,
} from "@/components/onboarding";
import { PROVINCIAS, useOnboarding, type FileRef } from "@/lib/onboarding-store";
import { submitOnboarding, fileToB64, getTipoPersonaPorCorreo } from "@/lib/api/onboarding";
import { getUsuarioActual } from "@/lib/api/auth";
import { usePrefillKyc } from "@/hooks/useOnboarding";
import { pageTitle } from "@/brand/brand";

export const Route = createFileRoute("/onboarding/kyc")({
  head: () => ({
    meta: [{ title: pageTitle("Validacion KYC") }, { name: "robots", content: "noindex" }],
  }),
  component: KycWizard,
});

const STEPS = ["DNI", "Servicio", "Selfie", "Residencia"];

function KycWizard() {
  const nav = useNavigate();
  const store = useOnboarding();
  const { kyc, setKyc } = store;
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<{
    dniFrente: FileRef;
    dniDorso: FileRef;
    servicio: FileRef;
    selfie: FileRef;
  }>({
    dniFrente: null,
    dniDorso: null,
    servicio: null,
    selfie: null,
  });
  const [addr, setAddr] = useState({
    direccion: kyc.direccion ?? "",
    direccion2: kyc.direccion2 ?? "",
    ciudad: kyc.ciudad ?? "",
    provincia: kyc.provincia ?? "",
    cp: kyc.cp ?? "",
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Prefill: si ya envió onboarding, cargar documentos existentes y dirección
  const { data: prefill, isLoading: loadingDocs } = usePrefillKyc();
  useEffect(() => {
    if (!prefill?.cliente) return;
    const cli = prefill.cliente;
    // Prefill dirección desde DB si existe
    if (cli.direccion)
      setAddr((a) => ({
        ...a,
        direccion: cli.direccion ?? a.direccion,
        direccion2: cli.direccion2 ?? a.direccion2,
        ciudad: cli.ciudad ?? a.ciudad,
        provincia: cli.provincia ?? a.provincia,
        cp: cli.cp ?? a.cp,
      }));
    const docs = prefill.documentos;
    if (docs.length === 0) return;
    const tipoMap: Record<string, keyof typeof files> = {
      id_frente: "dniFrente",
      id_dorso: "dniDorso",
      servicio: "servicio",
      selfie: "selfie",
    };
    const next: typeof files = {
      dniFrente: null,
      dniDorso: null,
      servicio: null,
      selfie: null,
    };
    try {
      for (const d of docs) {
        const key = tipoMap[d.tipo];
        if (!key) continue;
        // FileUpload espera {name, url}; sin file significa ya cargado
        next[key] = {
          name: d.label || (d.url as string).split("/").pop() || d.tipo,
          url: d.signedUrl ?? undefined,
        };
      }
    } catch {
      return;
    }
    setFiles((prev) => ({
      dniFrente: next.dniFrente ?? prev.dniFrente,
      dniDorso: next.dniDorso ?? prev.dniDorso,
      servicio: next.servicio ?? prev.servicio,
      selfie: next.selfie ?? prev.selfie,
    }));
  }, [prefill]);

  const canNext =
    (step === 0 && files.dniFrente && files.dniDorso) ||
    (step === 1 && files.servicio) ||
    (step === 2 && files.selfie) ||
    step === 3;

  const finish = async () => {
    const e: Record<string, string> = {};
    if (!addr.direccion.trim()) e.direccion = "Requerido";
    if (!addr.ciudad.trim()) e.ciudad = "Requerido";
    if (!addr.provincia) e.provincia = "Requerido";
    if (!addr.cp.trim()) e.cp = "Requerido";
    setErr(e);
    if (Object.keys(e).length) return;
    setKyc(addr);

    // Leer el estado fresco del store (no la referencia estancada de la última renderización)
    const estado = useOnboarding.getState();
    let { tipoCuenta, registro } = estado;
    const { datosPersonales, datosEmpresa } = estado;
    // Fallback si el store perdió datos (ej: login directo sin pasar por registro)
    if (!registro.email || !tipoCuenta) {
      try {
        const user = await getUsuarioActual();
        const mail = user?.email ?? "";
        if (mail && !registro.email) registro = { ...registro, email: mail };
        if (!tipoCuenta) {
          const metaTipo = (user?.user_metadata as { tipoCuenta?: string } | undefined)?.tipoCuenta;
          if (metaTipo === "juridica" || metaTipo === "fisica") tipoCuenta = metaTipo;
          else {
            const tipoPersona = await getTipoPersonaPorCorreo(mail);
            if (tipoPersona) tipoCuenta = tipoPersona === "juridica" ? "juridica" : "fisica";
          }
        }
      } catch {
        /* ignore fallback */
      }
    }
    const perfil: Record<string, unknown> = {
      direccion: addr.direccion,
      direccion2: addr.direccion2,
      ciudad: addr.ciudad,
      provincia: addr.provincia,
      cp: addr.cp,
      fechaNacimiento: registro.fechaNac ?? null,
    };
    let cuit: string;
    if (tipoCuenta === "juridica") {
      cuit = datosEmpresa.cuit ?? "";
      perfil.tipoSociedad = datosEmpresa.tipoId;
      perfil.nombreLegal = datosEmpresa.nombreLegal;
      perfil.nombreFantasia = datosEmpresa.nombreFantasia;
      perfil.fechaInscripcion = datosEmpresa.fechaInscripcion;
    } else {
      cuit = datosPersonales.cuitCuil ?? "";
      perfil.genero = datosPersonales.genero;
      perfil.cuitCuil = datosPersonales.cuitCuil;
      perfil.ocupacion = datosPersonales.ocupacion;
      perfil.origenFondos = datosPersonales.origenFondos;
      perfil.esPEP = datosPersonales.esPEP;
    }

    const kycB64: Record<string, { name: string; type: string; data: string } | null> = {};
    for (const key of ["dniFrente", "dniDorso", "servicio", "selfie"] as const) {
      const f = files[key];
      kycB64[key] = f?.file ? await fileToB64(f.file) : null;
    }

    const nombre =
      tipoCuenta === "juridica"
        ? datosEmpresa.nombreLegal || registro.nombre
        : `${registro.nombre} ${registro.apellido}`.trim();

    try {
      setSubmitting(true);
      setSubmitError(null);
      await submitOnboarding({
        email: registro.email ?? "",
        tipoCuenta: tipoCuenta as "fisica" | "juridica",
        nombre: nombre ?? "",
        cuit,
        perfil,
        kyc: kycB64,
      });
      nav({ to: "/onboarding/en-proceso" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error al enviar el alta");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      leftEyebrow="Paso 5 · Verificacion de identidad"
      leftTitle="Validamos tu identidad de forma segura."
      leftBody="Tus documentos se procesan en un entorno cifrado y se conservan segun normativa BCRA y Ley 25.246."
      step={`Paso ${step + 1} de 4`}
    >
      <FormTitle eyebrow="KYC · Documentacion" title="Validacion KYC" />
      <Stepper steps={STEPS} current={step} />

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

      {step === 3 && (
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
      )}
      {(step < 3 || loadingDocs) && (
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
