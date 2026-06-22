import Link from "next/link";
import { Sparkles } from "lucide-react";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-xl">
      <Sparkles className="h-6 w-6 text-primary" />
      <span>TurboApp</span>
    </Link>
  );
}
