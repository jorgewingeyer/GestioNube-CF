import {
  LayoutDashboard,
  LineChart,
  Binoculars,
  ListChecks,
  ListTree,
  LucideIcon,
  ScanBarcode,
  Store,
  Truck,
  UserRoundPlus,
  Users2,
  Wallet,
  Package2,
  FileText,
  FileInput,
  FileOutput,
  FileSymlink,
  ClipboardList,
  ArrowLeftRight,
} from "lucide-react";

import { usePermissions, useTenantFeatures } from "@/lib/permissions";

export type Role = "admin" | "super-admin" | "user";

export type MenuItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  role?: Role[];
  /** Permission key required to display the menu item */
  permission?: string;
  /** Feature key required to display the menu item (from TenantFeature::FEATURES) */
  feature?: string;
};

const allMenuItems: MenuItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Facturas de Compra",
    href: "/invoices-purchase",
    icon: FileInput,
    permission: "Ver Facturas de Compra",
    feature: "facturas_compra",
  },
  {
    name: "Facturas de Venta",
    href: "/invoices-sale",
    icon: FileOutput,
    permission: "Ver Facturas de Venta",
    feature: "facturas_venta",
  },
  {
    name: "Notas de Crédito/Débito",
    href: "/notes",
    icon: FileSymlink,
    permission: "Ver Notas de Crédito",
    feature: "notas_credito",
  },
  {
    name: "Presupuestos",
    href: "/budgets",
    icon: FileText,
    permission: "Ver Presupuestos",
    feature: "presupuestos",
  },
  {
    name: "Tesorería",
    href: "/transactions",
    icon: Wallet,
    permission: "Ver Transacciones",
    feature: "tesoreria",
  },
  {
    name: "Caja",
    href: "/cash-shifts",
    icon: Store,
    permission: "Ver Caja",
    feature: "caja",
  },
  {
    name: "Proveedores",
    href: "/providers",
    icon: Truck,
    permission: "Ver Proveedores",
  },
  {
    name: "Clientes",
    href: "/clients",
    icon: Users2,
    permission: "Ver Clientes",
  },
  {
    name: "Productos",
    href: "/products",
    icon: ScanBarcode,
    permission: "Ver Productos",
  },
  {
    name: "Historial de Precios",
    href: "/price-history",
    icon: LineChart,
    permission: "Ver Hitorial de Precios",
  },
  {
    name: "Inventario",
    href: "/inventory",
    icon: ListChecks,
    permission: "Ver Inventario",
    feature: "inventario",
  },
  {
    name: "Lotes",
    href: "/batches",
    icon: Package2,
    permission: "Ver Lotes",
    feature: "lotes",
  },
  {
    name: "Transferencias",
    href: "/stock-transfers",
    icon: ArrowLeftRight,
    feature: "transferencias",
  },
  {
    name: "Categorías",
    href: "/categories",
    icon: ListTree,
    permission: "Ver Categorias",
  },
  {
    name: "Usuarios",
    href: "/users",
    icon: UserRoundPlus,
    permission: "Ver Usuarios",
  },
  {
    name: "Actividad",
    href: "/activity",
    icon: Binoculars,
    permission: "Ver Actividades",
    feature: "actividad",
  },
  // {
  //   name: "ARCA",
  //   href: ArcaController.index().url,
  //   icon: ShieldCheck,
  //   feature: "facturacion_electronica",
  // },
  {
    name: "Reportes",
    href: "/reports",
    icon: ClipboardList,
    permission: "Ver Reportes",
    feature: "reportes",
  },
];

export function getMainMenu(userRoles: string[] = []): MenuItem[] {
  return allMenuItems.filter((item) => {
    if (!item.role) return true;
    return item.role.some((r) => userRoles.includes(r));
  });
}

// Hook: build main menu considering roles, permissions and tenant features
export function useMainMenu(userRoles: string[] = []): MenuItem[] {
  const { hasPermissions } = usePermissions();
  const features = useTenantFeatures();

  return allMenuItems.filter((item) => {
    const allowByRole =
      !item.role || item.role.some((r) => userRoles.includes(r));
    const allowByPermission =
      !item.permission ||
      hasPermissions?.some((p) => p.name === item.permission);
    const allowByFeature = !item.feature || (features[item.feature] ?? true);
    return allowByRole && allowByPermission && allowByFeature;
  });
}
