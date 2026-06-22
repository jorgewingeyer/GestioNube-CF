import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toogle";
import { LogoutButton } from "./components/logout-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background/95 border-b backdrop-blur supports-backdrop-filter:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto flex h-14 items-center justify-between">
          <Brand />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto py-6">{children}</main>
    </div>
  );
}
