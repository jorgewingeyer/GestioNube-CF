import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-xl">
      <div className="flex items-center">
        {/* Black logo for light mode */}
        <img
          src="/images/logo-black.svg"
          alt="GestioNube"
          className="h-8 w-auto dark:hidden"
        />
        {/* White logo for dark mode */}
        <img
          src="/images/logo-white.svg"
          alt="GestioNube"
          className="h-8 w-auto hidden dark:block"
        />
      </div>
    </Link>
  );
}
