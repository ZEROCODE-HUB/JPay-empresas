import { useState } from "react";
import { toast } from "sonner";
import { enrolarTotp, verificarTotp } from "@/lib/api/auth";

export type MetodoDosFactores = "email" | "totp";

/** Método 2FA elegido y alta/verificación del factor TOTP. */
export function useDosFactores() {
  const [metodo, setMetodo] = useState<MetodoDosFactores>("email");
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
    try {
      await verificarTotp(enroll.factorId, verifyCode);
      toast.success("2FA TOTP activado correctamente");
      setEnroll(null);
      setVerifyCode("");
    } catch {
      toast.error("Código inválido o verificación fallida");
    }
  };

  return { metodo, setMetodo, enroll, verifyCode, setVerifyCode, guardar, verificar };
}
