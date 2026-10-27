/** Reglas de contraseña que se muestran al registrarse y al resetearla. */
export const PASSWORD_RULES: Array<{ id: string; label: string; test: (s: string) => boolean }> = [
  { id: "len", label: "Mínimo 8 caracteres", test: (s) => s.length >= 8 },
  { id: "upper", label: "Una letra mayúscula", test: (s) => /[A-Z]/.test(s) },
  { id: "num", label: "Un número", test: (s) => /\d/.test(s) },
  { id: "special", label: "Un carácter especial (!/+-.)", test: (s) => /[!/+\-.]/.test(s) },
];

export function validatePassword(pw: string) {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

/** Imagen (por MIME del archivo o por extensión del nombre/URL) para mostrar miniatura. */
export function esImagen(value: { name?: string; url?: string; file?: File } | null | undefined) {
  if (value?.file?.type?.startsWith("image/")) return true;
  const n = (value?.name || value?.url || "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|heic|avif)$/.test(n);
}
