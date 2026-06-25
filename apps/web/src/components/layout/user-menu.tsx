"use client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";

import { Building2, CreditCard, LogOut, Shield, User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import Link from "next/link";
import { LogoutButton } from "../logout-button";
import { useLogout } from "@/app/(app)/hooks/use-logout";

interface userProps {
  name: string;
  email: string;
  avatar_url: string;
}

const UserMenu = () => {
  const { setOpen } = useLogout();
  // const { user } = usePage().props as Partial<{ user: userProps }>;
  // const fullUser = usePage().props.user as UserType | undefined;
  // const isSuperAdmin = fullUser?.roles?.some((r) => r.name === "super-admin");
  const isSuperAdmin = false;
  const user = {
    name: "Diego Nelson",
    email: "diegonelson@example.com",
    avatar_url: "https://example.com/avatar.jpg",
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="w-8 h-8 cursor-pointer">
          <AvatarImage src={user?.avatar_url} alt={"Foto de perfil"} />
          <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" asChild>
          <Link href="/account">
            <User className="mr-2 h-4 w-4" />
            Mi Cuenta
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" asChild>
          <Link href="/tenant">
            <Building2 className="mr-2 h-4 w-4" />
            Mi Empresa
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" asChild>
          <Link href="/suscription">
            <CreditCard className="mr-2 h-4 w-4" />
            Suscripción
          </Link>
        </DropdownMenuItem>

        {isSuperAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" asChild>
              <Link href="/super-admin">
                <Shield className="mr-2 h-4 w-4" />
                Panel de Administración
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem className="cursor-pointer w-full" asChild>
          <LogoutButton />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
