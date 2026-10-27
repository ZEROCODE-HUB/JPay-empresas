import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "@/features/onboarding/components";
import { brand, pageTitle } from "@/brand/brand";
import { LoginForm } from "@/features/auth/login/components/LoginForm";
import { RegisterForm } from "@/features/auth/login/components/RegisterForm";
import { SelectorAcceso } from "@/features/auth/login/components/SelectorAcceso";
import { useLoginPage } from "@/features/auth/login/hooks/useLoginPage";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, string | undefined>): { register?: "pf" | "pj" } => ({
    register: search.register as "pf" | "pj" | undefined,
  }),
  head: () => ({
    meta: [
      { title: pageTitle("Ingresar") },
      {
        name: "description",
        content: `Accede al portal de ${brand.name}. Plataforma de pagos digitales bajo normativa BCRA.`,
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const p = useLoginPage(search.register);

  return (
    <AuthShell
      leftEyebrow={`${brand.name} · Acceso`}
      leftTitle="Tu plataforma de pagos, sin intermediarios."
      leftBody={`${brand.name} opera bajo normativa BCRA. Tus datos viajan cifrados y se almacenan bajo los estándares del sistema financiero argentino.`}
    >
      <SelectorAcceso
        tab={p.tab}
        setTab={p.setTab}
        tipoCuenta={p.tipoCuenta}
        setTipoCuenta={p.setTipoCuenta}
      />

      <div className="relative overflow-hidden">
        <div className="transition-all duration-300 ease-in-out">
          {p.tab === "login" ? (
            <LoginForm onSuccess={p.handleLoginSuccess} />
          ) : (
            <RegisterForm
              tipo={p.tipoCuenta}
              onSuccess={p.handleRegisterSuccess}
              onSwitchToLogin={() => p.setTab("login")}
              submitting={p.registering}
              error={p.registerError}
            />
          )}
        </div>
      </div>
    </AuthShell>
  );
}
