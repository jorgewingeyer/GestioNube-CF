import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toogle";
import Link from "next/link";

export default function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-col items-center justify-center min-h-screen py-8 px-4">
        <div
          className="fixed inset-0 -z-10 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)]
            bg-size-[24px_24px]"
        ></div>
        <div className="fixed -z-10 h-screen w-full bg-[radial-gradient(circle_800px_at_100px_100px,#9333ea0d,transparent)]"></div>
        <div className="fixed -z-10 h-screen w-full bg-[radial-gradient(circle_800px_at_80%_80%,#3b82f610,transparent)]"></div>
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <ThemeToggle />
        </div>
        <div className="w-full flex flex-col items-center space-y-6">
          <div className="flex flex-col items-center">
            <Brand />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
