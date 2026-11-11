/** Texto legible de un error de consulta (Supabase, fetch o Error). */
export function mensajeError(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return traducir(error.message);
  if (typeof error === "object" && "message" in error)
    return traducir(String((error as { message: unknown }).message));
  return "";
}

function traducir(m: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(m))
    return "Revisa tu conexión a internet e inténtalo de nuevo.";
  return m;
}
