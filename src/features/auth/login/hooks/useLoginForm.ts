import { useState, type FormEvent } from "react";
import { getAuthErrorMessage } from "@/lib/supabase";
import {
  getEstadoClientePorCorreo,
  readDemoVerifyUrl,
  resendVerification,
} from "@/lib/api/onboarding";
import { iniciarSesion } from "@/lib/api/auth";
import {
  emailValido,
  esEmailNoConfirmado,
  estadoLoginDesdeCliente,
  type EstadoLogin,
} from "../utils";

/** Estado del formulario de login y del recuadro "pendiente de verificación" (con modo demo). */
export function useLoginForm(onSuccess: (estado: EstadoLogin, email: string) => void) {
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
    if (!destino || !emailValido(destino)) {
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

  const volverAlLogin = () => {
    setPendingEmail(null);
    setResendMsg(null);
    setDemoUrl(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: authErr } = await iniciarSesion(email, pw);
      if (authErr || !data.user) {
        const raw = authErr?.message ?? "";
        if (esEmailNoConfirmado(raw)) {
          setPendingEmail(email.trim());
          setDemoUrl(readDemoVerifyUrl(email.trim()));
          return;
        }
        setError(getAuthErrorMessage(raw || "No se pudo iniciar sesión"));
        return;
      }
      let estado: EstadoLogin = "pendiente";
      try {
        const raw =
          (await getEstadoClientePorCorreo(data.user.email ?? email)) ?? "pendiente_verificacion";
        // homologado: mapear nuevo flujo a compatibilidad con onSuccess existente
        estado = estadoLoginDesdeCliente(raw);
      } catch {
        // si no se puede consultar el estado, seguimos igual con "pendiente"
      }
      onSuccess(estado, data.user.email ?? email);
    } catch (e) {
      setError(getAuthErrorMessage(e instanceof Error ? e.message : "No se pudo iniciar sesión"));
    } finally {
      setLoading(false);
    }
  };

  return {
    email,
    setEmail,
    pw,
    setPw,
    error,
    loading,
    resendMsg,
    pendingEmail,
    resendLoading,
    demoUrl,
    reenviarVerificacion,
    volverAlLogin,
    submit,
  };
}

export type LoginFormState = ReturnType<typeof useLoginForm>;
