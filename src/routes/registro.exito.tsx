import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, DemoVerifyBox, PrimaryButton, SecondaryButton, SuccessCard } from "@/components/onboarding";
import { useOnboarding } from "@/lib/onboarding-store";
import { readDemoVerifyUrl, resendVerification } from "@/lib/api/onboarding";
import { getAuthErrorMessage } from "@/lib/supabase";
import { pageTitle } from "@/brand/brand";

export const Route = createFileRoute("/registro/exito")({
  head: () => ({
    meta: [
      { title: pageTitle("Registro exitoso") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegistroExito,
});

function RegistroExito() {
  const nav = useNavigate();
  const { registro } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoUrl, setDemoUrl] = useState<string | null>(() => readDemoVerifyUrl(registro.email));

  const reenviar = async () => {
    if (!registro.email) return;
    setLoading(true);
    setMsg(null);
    setError(null);
    try {
      const res = await resendVerification(registro.email);
      if (res.demo_token) setDemoUrl(readDemoVerifyUrl(registro.email));
      else setMsg("Reenviamos el correo. Revisá tu bandeja.");
    } catch (e) {
      setError(getAuthErrorMessage(e instanceof Error ? e.message : "No se pudo reenviar el correo"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell leftEyebrow="Paso 2 · Verificacion" leftTitle="Confirma tu correo para continuar." step="Correo enviado">
      <SuccessCard
        title="Registro exitoso"
        body={
          <>
            <p>
              Enviamos un correo a{" "}
              <span className="font-semibold text-black-800">{registro.email ?? "tu email"}</span>. Revisá tu bandeja y hacé clic en el link para validar la cuenta.
            </p>
            <p className="mt-3 text-xs text-black-400">
              Si no lo recibís, revisá spam o{" "}
              <button
                type="button"
                onClick={reenviar}
                disabled={loading}
                className="underline underline-offset-2 hover:text-primary-ink disabled:opacity-50"
              >
                {loading ? "reenviando..." : "reenviá el correo"}
              </button>
              . ¿Tenés un problema?{" "}
              <Link to="/" className="underline underline-offset-2 hover:text-primary-ink">
                Contactanos
              </Link>
              .
            </p>
            {demoUrl && <DemoVerifyBox url={demoUrl} />}
            {msg && <p className="mt-3 text-xs text-green-600">{msg}</p>}
            {error && <p className="mt-3 text-xs text-danger-600">{error}</p>}
          </>
        }
      >
        <PrimaryButton onClick={() => nav({ to: "/login" })}>Ir a inicio de sesion</PrimaryButton>
        <div className="flex justify-center">
          <SecondaryButton onClick={() => nav({ to: "/onboarding/datos-personales" })}>
            Continuar con el alta
          </SecondaryButton>
        </div>
      </SuccessCard>
    </AuthShell>
  );
}
