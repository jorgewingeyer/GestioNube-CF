"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
// import { User } from "@/types/user";
import { Building } from "lucide-react";

export default function BranchSwitcher() {
  // const { user, currentTenant } = usePage<{
  //   user: User;
  //   currentTenant: number | string;
  // }>().props;

  // const tenants = user?.tenants || [];

  // // Check permissions: admin or super-admin
  // const isSuperAdmin = user?.roles?.some((r) => r.name === 'super-admin');
  // const isAdmin = user?.roles?.some((r) => r.name === 'admin');

  // if (!isSuperAdmin && !isAdmin) {
  //   return null;
  // }

  // // If no tenants, nothing to show
  // if (!tenants.length) return null;

  const handleValueChange = (value: string) => {
    // router.post(BranchController.switchMethod().url, { tenant_id: value }, {
    //   preserveScroll: false,
    //   onSuccess: () => {
    //     toast.success("Sucursal cambiada correctamente");
    //     router.visit(window.location.href, { replace: true });
    //   },
    //   onError: () => {
    //     toast.error("Error al cambiar de sucursal");
    //   }
    // });
  };

  // // Ensure currentTenant is a string for Select value
  // const currentTenantId = currentTenant ? String(currentTenant) : "";
  const currentTenantId = "1";
  const tenants = [
    {
      id: 1,
      name: "Sucursal 1",
    },
  ];

  return (
    <div className="flex items-center gap-2 mr-2">
      <Building className="h-4 w-4 text-muted-foreground hidden md:block" />
      <Select value={currentTenantId} onValueChange={handleValueChange}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Seleccionar sucursal" />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((tenant) => (
            <SelectItem key={tenant.id} value={String(tenant.id)}>
              {tenant.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
