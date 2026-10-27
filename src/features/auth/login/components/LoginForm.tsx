import { Link } from "@tanstack/react-router";
import { Field, PasswordField, PrimaryButton } from "@/features/onboarding/components";
import { brand, mailto } from "@/brand/brand";
import { useLoginForm } from "../hooks/useLoginForm";
import type { EstadoLogin } from "../utils";
import { PendienteVerificacion } from "./PendienteVerificacion";

export function LoginForm({
  onSuccess,
}: {
  onSuccess: (estado: EstadoLogin, email: string) => void;
}) {
  const f = useLoginForm(onSuccess);

  if (f.pendingEmail) return <PendienteVerificacion f={f} />;

  return (
    <form className="space-y-4" onSubmit={f.submit}>
      <Field
        label="Correo electrónico"
        type="email"
        value={f.email}
        onChange={(e) => f.setEmail(e.target.value)}
        placeholder="hola@empresa.com"
      />
      <PasswordField label="Contraseña" value={f.pw} onChange={f.setPw} />
      <div className="flex justify-end">
        <Link
          to="/recuperar"
          className="text-xs text-black-400 hover:text-primary-ink underline underline-offset-2 transition-colors"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      {f.error && <p className="text-sm text-danger-600">{f.error}</p>}
      <div className="pt-1">
        <PrimaryButton type="submit" disabled={f.loading}>
          {f.loading ? "Ingresando..." : "Iniciar sesión"}
        </PrimaryButton>
      </div>
      <div className="text-center text-xs text-black-400 space-y-2 pt-2">
        <p>
          ¿No tienes una cuenta?{" "}
          <Link
            to="/login"
            search={{ register: "pf" }}
            className="text-primary-ink underline underline-offset-2 hover:opacity-80"
          >
            Registrate
          </Link>
        </p>
        <p>
          <a
            href={mailto(brand.contact.support)}
            className="text-black-400 hover:text-primary-ink underline underline-offset-2 transition-colors"
          >
            ¿Necesitas ayuda? Soporte
          </a>
        </p>
      </div>
    </form>
  );
}
