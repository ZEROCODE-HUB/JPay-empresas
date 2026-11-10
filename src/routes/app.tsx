import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  ArrowUpRight,
  Wallet,
  Link2,
  Receipt,
  Upload,
  History,
  UserCog,
  Shield,
  Store,
  Code2,
  Plug,
  MapPinned,
  FileBarChart2,
  Banknote,
  HandCoins,
  DollarSign,
  Repeat,
  CalendarClock,
  CreditCard,
  Globe,
  Layers,
  Settings,
} from "lucide-react";
import { PortalShell, type NavItem, type NavLeaf } from "@/components/portal-shell";
import { SupportBot } from "@/components/support-bot";
import { useDemoMode } from "@/contexts/demo-mode";
import { usePaisConModulos } from "@/shared/modulos-pais";
import { filtrarPorModulo } from "@/shared/pais";
import { RouteSkeleton } from "@/shared/ui/route-skeleton";
import { usePerfilSesion } from "@/hooks/useCuenta";

export const Route = createFileRoute("/app")({
  component: AppLayout,
  pendingComponent: RouteSkeleton,
});

// Menú por intención: Saldo, Cobrar (PayIn), Enviar (PayOut), Reportes y Configuración.
// Cada ítem con `modulo` aparece solo si el país lo tiene prendido (`paises.modulos`).
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  {
    label: "Saldo",
    icon: Wallet,
    items: [
      { to: "/app/historial", label: "Movimientos", icon: History },
      { to: "/app/subcuentas", label: "Subcuentas", icon: Layers },
      { to: "/app/dolares", label: "Dólares", icon: DollarSign, modulo: "transferencias_cobre" },
    ],
  },
  {
    label: "Cobrar",
    icon: HandCoins,
    items: [
      { to: "/app/cobrar/links", label: "Links de pago", icon: Link2 },
      {
        to: "/app/cobrar/spei",
        label: "Cobros por SPEI",
        icon: HandCoins,
        modulo: "transferencias_cobre",
      },
      {
        to: "/app/cobrar/tarjeta",
        label: "Cobros con tarjeta",
        icon: CreditCard,
        modulo: "pagos_proveedor",
      },
      { to: "/app/cobros", label: "Cobros masivos", icon: Upload },
      { to: "/app/suscripciones", label: "Suscripciones", icon: Repeat, modulo: "suscripciones" },
      {
        to: "/app/domiciliacion",
        label: "Domiciliación",
        icon: CalendarClock,
      },
      { to: "/app/puntos-fisicos", label: "Puntos físicos", icon: MapPinned, modulo: "pos" },
    ],
  },
  {
    label: "Enviar",
    icon: ArrowUpRight,
    items: [
      {
        to: "/app/enviar/spei",
        label: "Transferencias SPEI",
        icon: ArrowLeftRight,
        modulo: "transferencias_cobre",
      },
      {
        to: "/app/enviar/dolares",
        label: "Envíos en dólares",
        icon: Globe,
        modulo: "transferencias_cobre",
      },
      {
        to: "/app/retiros",
        label: "Retiros a tu banco",
        icon: Banknote,
        modulo: "retiros_proveedor",
      },
      { to: "/app/servicios", label: "Pago de servicios", icon: Receipt, modulo: "servicios" },
    ],
  },
  { to: "/app/reportes", label: "Reportes", icon: FileBarChart2 },
  {
    label: "Configuración",
    icon: Settings,
    items: [
      { to: "/app/cuenta", label: "Mi cuenta", icon: UserCog },
      { to: "/app/seguridad", label: "Seguridad", icon: Shield },
      { to: "/app/mis-comercios", label: "Mis comercios y sucursales", icon: Store },
      { to: "/app/integraciones", label: "Conexiones", icon: Plug, modulo: "pagos_proveedor" },
      { to: "/app/api-config", label: "APIs y e-commerce", icon: Code2 },
    ],
  },
];

// Barra inferior en móvil: lo más usado; el resto queda en «Más».
const NAV_MOVIL: NavLeaf[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/cobrar", label: "Cobrar", icon: HandCoins },
  { to: "/app/enviar", label: "Enviar", icon: ArrowUpRight, modulo: "transferencias_cobre" },
  { to: "/app/historial", label: "Movimientos", icon: History },
];

function AppLayout() {
  const pais = usePaisConModulos();
  const nav = useMemo(() => filtrarPorModulo(NAV, pais), [pais]);
  const navMovil = useMemo(() => filtrarPorModulo(NAV_MOVIL, pais), [pais]);
  const { role, setRole } = useDemoMode();
  const { nombre: userName, email: userEmail } = usePerfilSesion();

  useEffect(() => {
    if (role !== "empresa") setRole("empresa");
  }, [role, setRole]);

  return (
    <PortalShell
      nav={nav}
      mobileNav={navMovil}
      title="Portal Empresa"
      userName={userName}
      userEmail={userEmail}
    >
      <Outlet />
      <SupportBot />
    </PortalShell>
  );
}
