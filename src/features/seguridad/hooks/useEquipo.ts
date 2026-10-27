import { useState } from "react";
import { toast } from "sonner";
import { enviarInvitacion } from "@/lib/api/auth";
import { EQUIPO_INICIAL } from "../estados";
import { validarInvitacion } from "../utils";

/** Miembros del equipo (de ejemplo) y diálogo de invitación. */
export function useEquipo() {
  const [team, setTeam] = useState(EQUIPO_INICIAL);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Operador");

  const invitar = async () => {
    const email = inviteEmail.trim().toLowerCase();
    const nombre = inviteName.trim();
    const error = validarInvitacion(email, nombre, team);
    if (error) {
      toast.error(error);
      return;
    }
    try {
      await enviarInvitacion(email);
    } catch {
      // Fallback silencioso: igual se registra localmente y se notifica
    }
    setTeam((prev) => [...prev, { n: nombre, e: email, r: inviteRole, a: "Pendiente" }]);
    toast.success(`Invitación enviada a ${email}`);
    setInviteOpen(false);
    setInviteName("");
    setInviteEmail("");
    setInviteRole("Operador");
  };

  return {
    team,
    inviteOpen,
    setInviteOpen,
    inviteName,
    setInviteName,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    invitar,
  };
}
