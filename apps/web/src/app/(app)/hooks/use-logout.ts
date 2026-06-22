"use client";

import { useState, useTransition } from "react";
import { logoutAction } from "@/actions/auth/logout-action";

export function useLogout() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction();
    });
  };

  return {
    open,
    setOpen,
    isPending,
    handleLogout,
  };
}
