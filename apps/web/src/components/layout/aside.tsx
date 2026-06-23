"use client";
import { useMainMenu } from "@/lib/menus";
import { usePermissions } from "@/lib/permissions";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { Package2, LifeBuoy } from "lucide-react";
import Link from "next/link";

const Aside = () => {
  const { hasRole } = usePermissions();
  const mainMenu = useMainMenu(hasRole);

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 scroll-y-auto flex-col border-r bg-background sm:flex">
      <ScrollArea className="h-full">
        <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
          <Link
            href="#"
            className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base"
          >
            <Package2 className="h-4 w-4 transition-all group-hover:scale-110" />
            <span className="sr-only">Control de Inventario</span>
          </Link>
          {mainMenu.map((item) => (
            <Tooltip key={item.name}>
              <TooltipTrigger>
                <div>
                  <Link
                    href={item.href}
                    prefetch
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="sr-only">{item.name}</span>
                  </Link>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{item.name}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
        <nav className="mt-auto flex flex-col items-center gap-4 px-2 sm:py-5 pb-8">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/feedback"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
              >
                <LifeBuoy className="h-5 w-5" />
                <span className="sr-only">Feedback</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Soporte y Feedback</TooltipContent>
          </Tooltip>
        </nav>
      </ScrollArea>
    </aside>
  );
};

export default Aside;
