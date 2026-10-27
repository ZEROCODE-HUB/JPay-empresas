import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { TipoCuenta } from "@/lib/onboarding-store";
import {
  Field,
  PasswordField,
  PrimaryButton,
  validatePassword,
} from "@/features/onboarding/components";
import { emailValido, type DatosRegistro } from "../utils";

export function RegisterForm({
  tipo,
  onSuccess,
  onSwitchToLogin,
  submitting,
  error,
}: {
  tipo: TipoCuenta;
  onSuccess: (data: DatosRegistro) => void;
  onSwitchToLogin?: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const [f, setF] = useState({
    nombre: "",
    apellido: "",
    fechaNac: "",
    email: "",
    pw: "",
    pw2: "",
  });
  const [terms, setTerms] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailOk = emailValido(f.email);
  const pwOk = validatePassword(f.pw);
  const pwMatch = f.pw && f.pw === f.pw2;
  const valid = f.nombre && f.apellido && f.fechaNac && emailOk && pwOk && pwMatch && terms;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!valid) return;
        onSuccess({
          nombre: f.nombre,
          apellido: f.apellido,
          fechaNac: f.fechaNac,
          email: f.email,
          password: f.pw,
        });
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Nombre"
          value={f.nombre}
          onChange={(e) => setF({ ...f, nombre: e.target.value })}
          error={touched && !f.nombre ? "Requerido" : undefined}
        />
        <Field
          label="Apellido"
          value={f.apellido}
          onChange={(e) => setF({ ...f, apellido: e.target.value })}
          error={touched && !f.apellido ? "Requerido" : undefined}
        />
      </div>
      <Field
        label="Fecha de nacimiento"
        type="date"
        value={f.fechaNac}
        onChange={(e) => setF({ ...f, fechaNac: e.target.value })}
        error={touched && !f.fechaNac ? "Requerido" : undefined}
      />
      <Field
        label="Correo electrónico"
        type="email"
        value={f.email}
        onChange={(e) => setF({ ...f, email: e.target.value })}
        placeholder="nombre@dominio.com"
        error={touched && !emailOk ? "Ingresá un email válido" : undefined}
      />
      <PasswordField
        label="Contraseña"
        value={f.pw}
        onChange={(v) => setF({ ...f, pw: v })}
        showRules
        error={touched && !pwOk ? "La contraseña no cumple los requisitos" : undefined}
      />
      <PasswordField
        label="Confirmar contraseña"
        value={f.pw2}
        onChange={(v) => setF({ ...f, pw2: v })}
        error={touched && !pwMatch ? "Las contraseñas no coinciden" : undefined}
      />

      <label className="flex items-start gap-2.5 text-xs text-black-500 pt-1">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          className="mt-0.5 accent-primary-500"
        />
        <span>
          He leído y acepto los{" "}
          <a
            href="/legales/terminos"
            className="underline underline-offset-2 hover:text-primary-ink"
          >
            Términos y Condiciones
          </a>
          .
        </span>
      </label>

      {error && <p className="text-sm text-danger-600">{error}</p>}
      <div className="pt-1">
        <PrimaryButton type="submit" disabled={!valid || submitting}>
          {submitting ? "Registrando..." : "Registrarse"}
        </PrimaryButton>
      </div>

      <div className="text-center text-xs text-black-400 space-y-2 pt-2">
        <p>
          ¿Ya tenés una cuenta?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-primary-ink underline underline-offset-2 hover:opacity-80"
          >
            Iniciá sesión
          </button>
        </p>
        <p>
          {tipo === "juridica" ? (
            <Link
              to="/login"
              search={{ register: "pf" }}
              className="text-black-400 hover:text-primary-ink underline underline-offset-2 transition-colors"
            >
              ¿Sos persona física? Registrate como persona física
            </Link>
          ) : (
            <Link
              to="/login"
              search={{ register: "pj" }}
              className="text-black-400 hover:text-primary-ink underline underline-offset-2 transition-colors"
            >
              ¿Querés registrar tu empresa? Registrar empresa
            </Link>
          )}
        </p>
      </div>
    </form>
  );
}
