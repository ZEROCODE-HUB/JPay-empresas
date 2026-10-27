import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-store";
import { submitOnboarding, fileToB64, getTipoPersonaPorCorreo } from "@/lib/api/onboarding";
import { getUsuarioActual } from "@/lib/api/auth";
import { usePrefillKyc } from "@/hooks/useOnboarding";
import {
  ARCHIVOS_VACIOS,
  archivosDesdeDocumentos,
  armarAlta,
  CLAVES_ARCHIVOS,
  puedeAvanzar,
  validarDomicilio,
  type ArchivosKyc,
  type Domicilio,
} from "../utils";

import { getPais } from "@/shared/pais";
/** Estado del wizard KYC: documentos, domicilio, prefill y envío del alta. */
export function useKycWizard() {
  const nav = useNavigate();
  const store = useOnboarding();
  const { kyc, setKyc } = store;
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<ArchivosKyc>(ARCHIVOS_VACIOS);
  const [addr, setAddr] = useState<Domicilio>({
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
    let next: ArchivosKyc;
    try {
      next = archivosDesdeDocumentos(docs);
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

  const canNext = puedeAvanzar(step, files);

  const finish = async () => {
    const e = validarDomicilio(addr, getPais().domicilio.largoCodigoPostal);
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
    const { perfil, taxId, nombre } = armarAlta(
      addr,
      tipoCuenta,
      registro,
      datosPersonales,
      datosEmpresa,
    );

    const kycB64: Record<string, { name: string; type: string; data: string } | null> = {};
    for (const key of CLAVES_ARCHIVOS) {
      const f = files[key];
      kycB64[key] = f?.file ? await fileToB64(f.file) : null;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);
      await submitOnboarding({
        email: registro.email ?? "",
        tipoCuenta: tipoCuenta as "fisica" | "juridica",
        nombre: nombre ?? "",
        pais: getPais().codigo,
        taxId,
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

  return {
    step,
    setStep,
    files,
    setFiles,
    addr,
    setAddr,
    err,
    submitting,
    submitError,
    loadingDocs,
    canNext,
    finish,
  };
}

export type KycWizard = ReturnType<typeof useKycWizard>;
