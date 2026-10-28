import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Link2,
  Receipt,
  Upload,
  History,
  UserCog,
  Shield,
  Package,
  Store,
  List,
  ShoppingCart,
  Code2,
  Landmark,
  Plug,
  MapPinned,
  FileBarChart2,
  Banknote,
} from "lucide-react";
import { PortalShell, type NavItem } from "@/components/portal-shell";
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

// Cada ítem con `modulo` aparece solo si el país lo tiene prendido (`paises.modulos`).
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/historial", label: "Historial", icon: History },
  {
    to: "/app/transferencias",
    label: "Transferir",
    icon: ArrowLeftRight,
    modulo: "transferencias_salientes",
  },
  { to: "/app/subcuentas", label: "Subcuentas", icon: Wallet },
  { to: "/app/mis-comercios", label: "Mis comercios", icon: Store },
  { to: "/app/integraciones", label: "Integraciones", icon: Plug, modulo: "pagos_proveedor" },
  {
    to: "/app/reportes",
    label: "Reportes de cobros",
    icon: FileBarChart2,
    modulo: "pagos_proveedor",
  },
  { to: "/app/retiros", label: "Retiros", icon: Banknote, modulo: "retiros_proveedor" },
  {
    to: "/app/spei",
    label: "Transferencias SPEI",
    icon: ArrowLeftRight,
    modulo: "transferencias_cobre",
  },
  { to: "/app/puntos-fisicos", label: "Puntos físicos", icon: MapPinned, modulo: "pos" },
  {
    label: "Link de pago",
    icon: Link2,
    items: [
      { to: "/app/link-pago/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/link-pago/productos", label: "Productos", icon: Package },
      { to: "/app/link-pago/e-commerce", label: "E-commerce", icon: ShoppingCart },
    ],
  },
  { to: "/app/servicios", label: "Pago de servicios", icon: Receipt },
  {
    label: "Cobros masivos",
    icon: Upload,
    items: [
      { to: "/app/cobros", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/cobros/gestion", label: "Gestion de lotes", icon: List },
    ],
  },
  { to: "/app/liquidaciones", label: "Liquidaciones", icon: Landmark },
  { to: "/app/cuenta", label: "Mi cuenta", icon: UserCog },
  { to: "/app/seguridad", label: "Seguridad", icon: Shield },
  { to: "/app/api-config", label: "Config. APIs Externas", icon: Code2 },
];

function AppLayout() {
  const pais = usePaisConModulos();
  const nav = useMemo(() => filtrarPorModulo(NAV, pais), [pais]);
  const { role, setRole } = useDemoMode();
  const { nombre: userName, email: userEmail } = usePerfilSesion();

  useEffect(() => {
    if (role !== "empresa") setRole("empresa");
  }, [role, setRole]);

  return (
    <PortalShell nav={nav} title="Portal Empresa" userName={userName} userEmail={userEmail}>
      <Outlet />
      <SupportBot />
    </PortalShell>
  );
}
