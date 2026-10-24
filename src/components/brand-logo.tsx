import { brand } from "@/brand/brand";

/** Manual de marca: el imagotipo no se usa por debajo de 116 × 36 px. */
const MIN_HEIGHT = 36;

/**
 * Imagotipo de la marca.
 * - `variant="dark"` (por defecto): texto oscuro, para fondos claros.
 * - `variant="light"`: versión en negativo (texto claro), para fondos oscuros.
 * No encerrarlo en recuadros ni recolorearlo con filtros: usar la variante que corresponde.
 */
export function BrandLogo({
  className = "",
  variant = "dark",
  size = MIN_HEIGHT,
}: {
  className?: string;
  variant?: "dark" | "light";
  /** Alto en px (mínimo 36). */
  size?: number;
}) {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <img
        src={variant === "light" ? brand.assets.logoLight : brand.assets.logo}
        alt={brand.name}
        style={{ height: Math.max(size, MIN_HEIGHT), width: "auto", display: "block" }}
      />
    </div>
  );
}
