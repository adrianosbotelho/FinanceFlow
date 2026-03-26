"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/retornos", label: "Retornos" },
  { href: "/investimentos", label: "Investimentos" },
  { href: "/metas", label: "Metas" },
  { href: "/health", label: "Health" },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname.startsWith("/login")) {
    return null;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900/70 p-4 md:block">
        <div className="mb-5">
          <p className="text-xl font-extrabold text-slate-100">FinanceFlow Mobile</p>
          <p className="text-xs text-slate-400">Web/PWA (isolado do desktop)</p>
        </div>
        <nav className="space-y-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => void logout()}
          className="mt-6 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          Sair
        </button>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-900/95 backdrop-blur md:hidden">
        <div className="flex items-center gap-3 overflow-x-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-3 text-center text-sm font-medium leading-none ${
                  active ? "bg-indigo-600 text-white" : "text-slate-300"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <button
            onClick={() => void logout()}
            className="shrink-0 whitespace-nowrap rounded-lg px-4 py-3 text-center text-sm font-medium leading-none text-slate-300"
          >
            Sair
          </button>
        </div>
      </nav>
    </>
  );
}
