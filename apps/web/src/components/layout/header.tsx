import { ToggleTheme } from "./toogle-theme";
import UserMenu from "@/components/layout/user-menu";
import { Building } from "lucide-react";

import BranchSwitcher from "./branch-switcher";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";
import { NotificationDropdown } from "../notifications/notification-dropdown";

const header = () => {
  const tenant = {
    id: 1,
    name: "Sucursal 1",
    logo_url: "",
    is_branch: true,
  };
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      {/* <SheetMenu /> */}
      {/* Borrar div al agregar search de diego */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Avatar className="h-6 w-6 hidden md:inline-flex">
          <AvatarImage
            src={tenant?.logo_url ?? ""}
            alt={tenant?.name ?? "Tenant"}
          />
          <AvatarFallback>
            <Building className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {tenant?.is_branch ? "Sucursal" : "Empresa"}
          </span>
          <span className="font-medium truncate max-w-[40vw] sm:max-w-[50vw] text-foreground">
            {tenant?.name ?? ""}
          </span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <BranchSwitcher />
        <ToggleTheme />
        <NotificationDropdown />
        <UserMenu />
      </div>
    </header>
  );
};

export default header;
