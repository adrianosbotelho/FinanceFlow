import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import { PageWrapper } from "../components/layout/PageWrapper";

export const metadata: Metadata = {
  title: "FinanceFlow - Passive Income Dashboard",
  description: "Personal passive income analytics for CDBs and FIIs.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background text-slate-100 antialiased">
        <PageWrapper>{children}</PageWrapper>
      </body>
    </html>
  );
}
