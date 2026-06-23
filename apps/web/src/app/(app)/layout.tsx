import Aside from "@/components/layout/aside";
import Header from "@/components/layout/header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen w-full ">
      <Aside />
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
        <Header />
        <main className="container p-8 mx-auto">
          {/* <FreeTierAlert /> */}
          {children}
        </main>
      </div>
    </div>
  );
}
