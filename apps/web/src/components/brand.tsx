"use client";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function Brand() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-xl">
      <div className="flex items-center">
        <img
          src={isDark ? "/images/logo-white.svg" : "/images/logo-black.svg"}
          alt="GestioNube"
          className="h-8 w-auto"
        />
      </div>
    </Link>
  );
}
