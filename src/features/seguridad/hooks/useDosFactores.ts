import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { enrolarTotp, verificarTotp } from "@/lib/api/auth";
import { KEY_FACTORES_MFA, useFactoresMfa } from "@/hooks/useAuth";
import { mfaActivo } from "../utils";

export type MetodoDosFactores = "email" | "totp";

/** Método 2FA elegido y alta/verificación del factor TOTP. */
export function useDosFactores() {
  const queryClient = useQueryClient();
  const { factores, loading: loadingFactores, error: errorFactores } = useFactoresMfa();
  // null mientras no se sabe (cargando o error): no se muestra el badge.
  const activo = loadingFactores || errorFactores ? null : mfaActivo(factores);
  const [metodo, setMetodo] = useState<MetodoDosFactores>("totp");
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(
    null,
  );
  const [verifyCode, setVerifyCode] = useState("");

  const guardar = async () => {
    try {
      if (metodo === "totp") {
        setEnroll(await enrolarTotp());
        toast.success("Escanea el QR y verifica el código para activar TOTP");
      } else {
        toast.success("Método 2FA por email configurado");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo configurar 2FA");
    }
  };

  const verificar = async () => {
    if (!enroll) return;
    const code = verifyCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      toast.error("Ingresá el código de 6 dígitos de tu app");
      return;
    }
    try {
      await verificarTotp(enroll.factorId, code);
      toast.success("2FA TOTP activado correctamente");
      setEnroll(null);
      setVerifyCode("");
      await queryClient.invalidateQueries({ queryKey: KEY_FACTORES_MFA });
    } catch {
      toast.error("Código inválido o verificación fallida");
    }
  };

  return { activo, metodo, setMetodo, enroll, verifyCode, setVerifyCode, guardar, verificar };
}
