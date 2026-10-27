import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cerrarSesion as cerrarSesionAuth } from "@/lib/api/auth";
import { useUsuarioActual } from "@/hooks/useAuth";
import { SIN_EXPIRACION } from "../utils";

/**
 * Sesión actual y tiempo de expiración por inactividad. supabase-js no lista ni
 * revoca otras sesiones puntuales desde el cliente: solo se puede cerrar todas.
 */
export function useSesiones() {
  const navigate = useNavigate();
  const { usuario, loading } = useUsuarioActual();
  const [sesionTiempo, setSesionTiempo] = useState(SIN_EXPIRACION);
  const [customTiempo, setCustomTiempo] = useState("");

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
    usuario,
    loadingUsuario: loading,
    sesionTiempo,
    setSesionTiempo,
    customTiempo,
    setCustomTiempo,
    cerrarTodas,
  };
}
