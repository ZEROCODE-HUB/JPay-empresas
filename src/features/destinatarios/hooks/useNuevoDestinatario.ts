import { useState } from "react";
import { toast } from "sonner";
import { toDataError } from "@/lib/supabase";
import { createFrequentRecipient } from "@/lib/api/transferencias";
import { detectIdentifierKind } from "@/lib/recipient-validation";
import { validateRecipient } from "@/lib/recipient-bdc";

/** Formulario "Nuevo destinatario": valida el CBU/CVU/Alias y lo guarda en la agenda. */
export function useNuevoDestinatario(onGuardado: () => Promise<unknown>) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [alias, setAlias] = useState("");
  const [cbu, setCbu] = useState("");
  const [cuit, setCuit] = useState("");

  const guardar = async () => {
    const identifier = (cbu || alias).trim();
    if (!identifier) {
      toast.error("Ingresa CBU/CVU (22 dígitos) o Alias");
      return;
    }
    const res = await validateRecipient(identifier, detectIdentifierKind(identifier));
    if (!res.ok) {
      toast.error(res.errorMessage ?? "Destinatario no válido");
      return;
    }
    try {
      await createFrequentRecipient({
        identifier: res.identifier,
        nombre: nombre || res.titular?.nombre || "Destinatario",
        alias: res.titular?.alias ?? alias,
        cbu: res.titular?.cbu ?? cbu,
        cuit: cuit || res.titular?.cuit,
        banco: res.titular?.banco ?? undefined,
      });
      await onGuardado();
      setOpen(false);
      setNombre("");
      setAlias("");
      setCbu("");
      setCuit("");
      toast.success("Destinatario agregado a tu agenda");
    } catch (e) {
      toast.error(toDataError(e).message);
    }
  };

  return { open, setOpen, nombre, setNombre, alias, setAlias, cbu, setCbu, cuit, setCuit, guardar };
}

export type NuevoDestinatario = ReturnType<typeof useNuevoDestinatario>;
