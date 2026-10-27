import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cerrarSesion as cerrarSesionAuth } from "@/lib/api/auth";
import { SESIONES_INICIALES } from "../estados";

/** Sesiones activas (de ejemplo) y tiempo de expiración por inactividad. */
export function useSesiones() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(SESIONES_INICIALES);
  const [sesionTiempo, setSesionTiempo] = useState("Nunca");
  const [customTiempo, setCustomTiempo] = useState("");

  const cerrarSesion = async (i: number) => {
    setSessions((p) => p.filter((_, j) => j !== i));
    if (sessions[i]?.curr) {
      try {
        await cerrarSesionAuth();
      } catch {
        /* noop */
      }
      navigate({ to: "/login" });
    } else {
      toast.success("Sesión cerrada");
    }
  };

  const cerrarTodas = async () => {
    try {
      await cerrarSesionAuth("global");
      toast.success("Todas las sesiones fueron cerradas");
      navigate({ to: "/login" });
    } catch {
      toast.error("No se pudieron cerrar las sesiones");
    }
  };

  return {
    sessions,
    sesionTiempo,
    setSesionTiempo,
    customTiempo,
    setCustomTiempo,
    cerrarSesion,
    cerrarTodas,
  };
}
