import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Banknote, HandCoins, Link2, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { usePaisConModulos } from "@/shared/modulos-pais";
import { filtrarPorModulo, type Modulo } from "@/shared/pais";

type Acceso = { to: string; label: string; icon: LucideIcon; modulo?: Modulo };

const ACCESOS: Acceso[] = [
  { to: "/app/cobrar/links/productos", label: "Crear link de pago", icon: Link2 },
  {
    to: "/app/cobrar/spei",
    label: "Cobrar por SPEI",
    icon: HandCoins,
    modulo: "transferencias_cobre",
  },
  {
    to: "/app/enviar/spei",
    label: "Transferir",
    icon: ArrowLeftRight,
    modulo: "transferencias_cobre",
  },
  { to: "/app/retiros", label: "Retirar", icon: Banknote, modulo: "retiros_proveedor" },
];

/** Accesos rápidos del inicio a lo que más se usa (según los módulos del país). */
export function AccesosRapidos() {
  const pais = usePaisConModulos();
  const accesos = useMemo(() => filtrarPorModulo(ACCESOS, pais), [pais]);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {accesos.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="bg-white border border-black-100 rounded-md px-4 py-3 flex items-center gap-3 text-sm font-semibold text-black-700 hover:bg-black-50 transition-colors"
        >
          <span className="w-9 h-9 rounded-sm flex items-center justify-center shrink-0 bg-primary-50 text-primary-ink">
            <Icon size={18} />
          </span>
          {label}
        </Link>
      ))}
    </div>
  );
}
