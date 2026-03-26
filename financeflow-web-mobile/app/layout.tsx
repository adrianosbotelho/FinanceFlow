import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppNav } from "@/components/AppNav";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "FinanceFlow Web Mobile",
  description: "Acesso web/mobile para Dashboard, Retornos, Investimentos e Metas",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FinanceFlow",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1327",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaRegister />
        <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 md:flex">
          <AppNav />
          <main className="w-full p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
            <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
