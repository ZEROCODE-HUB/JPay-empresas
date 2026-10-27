import { useState } from "react";
import { toast } from "sonner";
import { cambiarPassword } from "@/lib/api/auth";
import { validarCambioPassword, type FormPassword } from "../utils";

const VACIO: FormPassword = { actual: "", nueva: "", repetir: "" };

export function useCambioPassword() {
  const [pw, setPw] = useState<FormPassword>(VACIO);
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    const error = validarCambioPassword(pw);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await cambiarPassword(pw.actual, pw.nueva);
      toast.success("Contraseña actualizada correctamente");
      setPw(VACIO);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  };

  return { pw, setPw, saving, guardar };
}
