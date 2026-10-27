import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, Field, PrimaryButton, SuccessCard, FormTitle } from "@/components/onboarding";
import { requireSupabase, getAuthErrorMessage } from "@/lib/supabase";
import { brand, pageTitle } from "@/brand/brand";

export const Route = createFileRoute("/recuperar")({
  validateSearch: (search: Record<string, string | undefined>): { email?: string } => ({
    email: search.email,
  }),
  head: () => ({
    meta: [
      { title: pageTitle("Recuperar contraseña") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Recuperar,
});

function Recuperar() {
  const { email: initialEmail } = Route.useSearch();
  const nav = useNavigate();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const sb = requireSupabase();
    const { error: err } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (err) {
      setError(getAuthErrorMessage(err.message));
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell
      leftEyebrow={`${brand.name} · Acceso`}
      leftTitle="Tu plataforma de pagos, sin intermediarios."
      leftBody={`${brand.name} opera bajo normativa BCRA. Tus datos viajan cifrados y se almacenan bajo los estándares del sistema financiero argentino.`}
    >
      {sent ? (
        <SuccessCard
          title="Revisá tu correo"
          body={
            <p>
              Enviamos un enlace de recuperación a{" "}
              <span className="font-semibold text-black-700">{email}</span>. Hacé clic en él para crear una
              nueva contraseña. Si no lo encontrás, revisá la carpeta de spam.
            </p>
          }
        >
          <PrimaryButton onClick={() => nav({ to: "/login" })}>
            Volver al inicio de sesión
          </PrimaryButton>
        </SuccessCard>
      ) : (
        <>
          <FormTitle
            eyebrow="Recuperar contraseña"
            title="¿Olvidaste tu contraseña?"
            subtitle="Ingresá el correo asociado a tu cuenta y te enviaremos un enlace para crear una nueva."
          />
          <form className="space-y-4" onSubmit={submit}>
            <Field
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hola@empresa.com"
            />
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <div className="pt-1">
              <PrimaryButton type="submit" disabled={loading || !email.trim()}>
                {loading ? "Enviando…" : "Enviar enlace de recuperación"}
              </PrimaryButton>
            </div>
            <div className="text-center text-xs text-black-400 pt-2">
              <Link
                to="/login"
                className="text-primary-ink underline underline-offset-2 hover:opacity-80"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          </form>
        </>
      )}
    </AuthShell>
  );
}
