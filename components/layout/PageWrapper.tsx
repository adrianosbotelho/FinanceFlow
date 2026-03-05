import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";

export function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header />
        <main className="flex-1 px-4 pb-6 pt-4 md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl space-y-8">{children}</div>
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
