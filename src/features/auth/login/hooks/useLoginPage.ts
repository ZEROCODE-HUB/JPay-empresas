import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDemoMode } from "@/contexts/demo-mode";
import { useOnboarding, type TipoCuenta } from "@/lib/onboarding-store";
import {
  getClienteOnboardingPorCorreo,
  registerClient,
  tieneValidacionODocumento,
} from "@/lib/api/onboarding";
import type { DatosRegistro, EstadoLogin } from "../utils";

/** Pestañas de la pantalla de acceso y qué pasa después de registrarse o iniciar sesión. */
export function useLoginPage(register: "pf" | "pj" | undefined) {
  const [tab, setTab] = useState<"login" | "register">(register ? "register" : "login");
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuenta>(
    register === "pj" ? "juridica" : "fisica",
  );
  const { setRole } = useDemoMode();
  const store = useOnboarding();
  const navigate = useNavigate();
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const handleRegisterSuccess = async (data: DatosRegistro) => {
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

  const handleLoginSuccess = async (estado: EstadoLogin, email: string) => {
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

  return {
    tab,
    setTab,
    tipoCuenta,
    setTipoCuenta,
    registering,
    registerError,
    handleRegisterSuccess,
    handleLoginSuccess,
  };
}
