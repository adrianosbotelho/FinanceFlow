"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/retornos", label: "Retornos" },
  { href: "/investimentos", label: "Investimentos" },
  { href: "/metas", label: "Metas" },
  { href: "/health", label: "Health" },
];

export function AppNav() {
  const pathname = usePathname();

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
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-800 bg-slate-900/95 p-2 backdrop-blur md:hidden">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-2 py-2 text-center text-xs ${
                active ? "bg-indigo-600 text-white" : "text-slate-300"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
