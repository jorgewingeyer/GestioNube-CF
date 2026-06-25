import { Brand } from "@/components/brand";
import { ToggleTheme } from "@/components/layout/toogle-theme";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ToggleTheme />
      </div>
      <div className="mb-8">
        <Brand />
      </div>
      <div className="w-full max-w-md space-y-4 rounded-lg p-8">{children}</div>
    </div>
  );
}
