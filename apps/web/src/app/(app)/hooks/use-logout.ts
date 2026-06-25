"use client";

import { useState } from "react";
import { logoutAction } from "@/actions/auth/logout-action";
import { useRouter } from "next/navigation";

export function useLogout() {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    setIsPending(true);
    await logoutAction();
    router.push("/login");
  };

  return {
    open,
    setOpen,
    isPending,
    handleLogout,
  };
}
