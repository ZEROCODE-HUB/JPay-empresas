import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDemoMode } from "@/contexts/demo-mode";
import { useOnboarding, type TipoCuenta } from "@/lib/onboarding-store";
import {
  AuthShell,
  DemoVerifyBox,
  Field,
  PasswordField,
  PrimaryButton,
  SuccessCard,
  validatePassword,
} from "@/components/onboarding";
import { getAuthErrorMessage } from "@/lib/supabase";
import {
  getClienteOnboardingPorCorreo,
  getEstadoClientePorCorreo,
  readDemoVerifyUrl,
  registerClient,
  resendVerification,
  tieneValidacionODocumento,
} from "@/lib/api/onboarding";
import { iniciarSesion } from "@/lib/api/auth";
import { brand, pageTitle, mailto } from "@/brand/brand";

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

function LoginForm({
  onSuccess,
}: {
  onSuccess: (estado: "aprobado" | "pendiente" | "rechazado", email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [demoUrl, setDemoUrl] = useState<string | null>(null);

  const reenviarVerificacion = async () => {
    const destino = (pendingEmail ?? email).trim();
    if (!destino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
      setResendMsg("Ingresá tu correo arriba para reenviar la verificación.");
      return;
    }
    setResendLoading(true);
    try {
      const res = await resendVerification(destino);
      if (res.demo_token) {
        setDemoUrl(readDemoVerifyUrl(destino));
        setResendMsg(null);
      } else {
        setResendMsg(
          `Te enviamos el mail de verificación a ${destino}. Revisá tu bandeja y la carpeta de spam.`,
        );
      }
    } catch (e) {
      setResendMsg(
        e instanceof Error ? getAuthErrorMessage(e.message) : "No se pudo reenviar el correo.",
      );
    } finally {
      setResendLoading(false);
    }
  };

  // Recuadro para pendiente_verificacion en lugar de letras rojas
  if (pendingEmail) {
    return (
      <SuccessCard
        variant="info"
        title="Pendiente de verificación de email"
        body={
          <>
            <p>
              Tu correo aún no está verificado. Revisá tu bandeja de entrada y hacé clic en el
              enlace para activar tu cuenta.
            </p>
            <p className="mt-3 text-xs text-black-400">
              Si no lo recibís, revisá spam o reenviá el correo. Si tenés algún problema,{" "}
              <a
                href={mailto(brand.contact.support)}
                className="underline underline-offset-2 hover:text-primary-ink"
              >
                ¿Necesitas ayuda? Soporte
              </a>
              .
            </p>
            {demoUrl && <DemoVerifyBox url={demoUrl} />}
            {resendMsg && <p className="mt-3 text-xs text-green-600">{resendMsg}</p>}
          </>
        }
      >
        <PrimaryButton onClick={reenviarVerificacion} disabled={resendLoading}>
          {resendLoading ? "Reenviando…" : "Reenviar correo de verificación"}
        </PrimaryButton>
        <button
          type="button"
          onClick={() => {
            setPendingEmail(null);
            setResendMsg(null);
            setDemoUrl(null);
          }}
          className="mt-2 w-full text-xs text-black-400 hover:text-primary-ink underline underline-offset-2"
        >
          Volver al inicio de sesión
        </button>
      </SuccessCard>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          const { data, error: authErr } = await iniciarSesion(email, pw);
          if (authErr || !data.user) {
            const raw = authErr?.message ?? "";
            if (/email not confirmed/i.test(raw)) {
              setPendingEmail(email.trim());
              setDemoUrl(readDemoVerifyUrl(email.trim()));
              return;
            }
            setError(getAuthErrorMessage(raw || "No se pudo iniciar sesión"));
            return;
          }
          let estado: "aprobado" | "pendiente" | "rechazado" = "pendiente";
          try {
            const raw =
              (await getEstadoClientePorCorreo(data.user.email ?? email)) ??
              "pendiente_verificacion";
            // homologado: mapear nuevo flujo a compatibilidad con onSuccess existente
            if (raw === "activado" || raw === "activo") estado = "aprobado";
            else if (raw === "deshabilitado" || raw === "eliminado" || raw === "rechazado")
              estado = "rechazado";
            else estado = "pendiente";
          } catch {
            // si no se puede consultar el estado, seguimos igual con "pendiente"
          }
          onSuccess(estado, data.user.email ?? email);
        } catch (e) {
          setError(
            getAuthErrorMessage(e instanceof Error ? e.message : "No se pudo iniciar sesión"),
          );
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field
        label="Correo electrónico"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="hola@empresa.com"
      />
      <PasswordField label="Contraseña" value={pw} onChange={setPw} />
      <div className="flex justify-end">
        <Link
          to="/recuperar"
          className="text-xs text-black-400 hover:text-primary-ink underline underline-offset-2 transition-colors"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      {error && <p className="text-sm text-danger-600">{error}</p>}
      <div className="pt-1">
        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Iniciar sesión"}
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

function RegisterForm({
  tipo,
  onSuccess,
  onSwitchToLogin,
  submitting,
  error,
}: {
  tipo: TipoCuenta;
  onSuccess: (data: {
    nombre: string;
    apellido: string;
    fechaNac: string;
    email: string;
    password: string;
  }) => void;
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

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email);
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

function LoginPage() {
  const search = Route.useSearch();
  const register = search.register;
  const [tab, setTab] = useState<"login" | "register">(register ? "register" : "login");
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuenta>(
    register === "pj" ? "juridica" : "fisica",
  );
  const { setRole } = useDemoMode();
  const store = useOnboarding();
  const navigate = useNavigate();
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const handleRegisterSuccess = async (data: {
    nombre: string;
    apellido: string;
    fechaNac: string;
    email: string;
    password: string;
  }) => {
    store.reset();
    store.setTipo(tipoCuenta);
    store.setRegistro(data);
    try {
      setRegistering(true);
      setRegisterError(null);
      await registerClient({
        email: data.email,
        password: data.password,
        nombre: data.nombre,
        apellido: data.apellido,
        fechaNac: data.fechaNac,
        tipoCuenta,
      });
      navigate({ to: "/registro/exito" });
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : "No se pudo registrar la cuenta");
    } finally {
      setRegistering(false);
    }
  };

  const handleLoginSuccess = async (
    estado: "aprobado" | "pendiente" | "rechazado",
    email: string,
  ) => {
    // El store persiste en localStorage y es compartido por todo el browser.
    // Si el email almacenado no coincide con el que está iniciando sesión, lo reiniciamos
    // para no heredar datos (incluido el CUIT) de otro usuario/sesión.
    if (store.registro.email && store.registro.email !== email) {
      store.reset();
    }
    setRole("empresa");
    if (estado === "aprobado") {
      navigate({ to: "/app" });
      return;
    }
    if (estado === "rechazado") {
      // deshabilitado/eliminado: mostrar cuenta pero sin operatividad (misma pantalla en-proceso con mensaje)
      navigate({ to: "/onboarding/en-proceso" });
      return;
    }
    try {
      // Un error de consulta se trata como "sin cliente", igual que antes.
      const cli = await getClienteOnboardingPorCorreo(email).catch(() => null);
      if (!cli) {
        navigate({ to: "/onboarding/datos-personales" });
        return;
      }
      const raw = cli.estado ?? "";
      if (raw === "pendiente_verificacion") {
        // Mostrar recuadro de verificación en lugar de validación simulada
        navigate({ to: "/onboarding/en-proceso" });
        return;
      }
      if (raw === "registrado") {
        // Registrado: si aún no envió documentación -> onboarding, si ya envió -> recuadro en revisión
        const incompleto = cli.onboarding_completo === false || cli.onboarding_completo === null;
        if (incompleto) {
          try {
            if (!(await tieneValidacionODocumento(cli.legajo))) {
              navigate({ to: "/onboarding/datos-personales" });
              return;
            }
            // Tiene docs/validación -> ya envió onboarding, mostrar Registrado en revisión
            navigate({ to: "/onboarding/en-proceso" });
            return;
          } catch {
            navigate({ to: "/onboarding/en-proceso" });
            return;
          }
        }
        // onboarding_completo true -> recuadro Registrado en revisión
        navigate({ to: "/onboarding/en-proceso" });
        return;
      }
      navigate({ to: "/onboarding/en-proceso" });
    } catch {
      navigate({ to: "/onboarding/en-proceso" });
    }
  };

  return (
    <AuthShell
      leftEyebrow={`${brand.name} · Acceso`}
      leftTitle="Tu plataforma de pagos, sin intermediarios."
      leftBody={`${brand.name} opera bajo normativa BCRA. Tus datos viajan cifrados y se almacenan bajo los estándares del sistema financiero argentino.`}
    >
      <div className="grid grid-cols-2 border-b border-black-100 mb-8">
        <button
          onClick={() => setTab("login")}
          className={`pb-3 text-sm font-semibold transition-colors ${
            tab === "login" ? "border-b-2 border-primary-500 text-black-800" : "text-black-400"
          }`}
        >
          Iniciar sesión
        </button>
        <button
          onClick={() => setTab("register")}
          className={`pb-3 text-sm font-semibold transition-colors ${
            tab === "register" ? "border-b-2 border-primary-500 text-black-800" : "text-black-400"
          }`}
        >
          Crear cuenta
        </button>
      </div>

      {tab === "register" && (
        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={() => setTipoCuenta("fisica")}
            className={`flex-1 h-11 text-xs font-semibold tracking-wide transition-all rounded-sm ${
              tipoCuenta === "fisica"
                ? "bg-black text-white"
                : "bg-white text-black-400 border border-black-100"
            }`}
          >
            Persona Física
          </button>
          <button
            type="button"
            onClick={() => setTipoCuenta("juridica")}
            className={`flex-1 h-11 text-xs font-semibold tracking-wide transition-all rounded-sm ${
              tipoCuenta === "juridica"
                ? "bg-black text-white"
                : "bg-white text-black-400 border border-black-100"
            }`}
          >
            Persona Jurídica
          </button>
        </div>
      )}

      <div className="relative overflow-hidden">
        <div className="transition-all duration-300 ease-in-out">
          {tab === "login" ? (
            <LoginForm onSuccess={handleLoginSuccess} />
          ) : (
            <RegisterForm
              tipo={tipoCuenta}
              onSuccess={handleRegisterSuccess}
              onSwitchToLogin={() => setTab("login")}
              submitting={registering}
              error={registerError}
            />
          )}
        </div>
      </div>
    </AuthShell>
  );
}
