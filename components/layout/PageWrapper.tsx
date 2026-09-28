import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { DataRefreshBridge } from "./DataRefreshBridge";

export function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <DataRefreshBridge />
      <Sidebar />
      {/* min-w-0: a coluna pode encolher; tabelas e gráficos largos rolam dentro do próprio contêiner. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-w-0 flex-1 px-4 pb-6 pt-4 md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl space-y-8">{children}</div>
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
