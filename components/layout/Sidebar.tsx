 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/performance", label: "Performance" },
  { href: "/investments", label: "Investimentos" },
  { href: "/returns", label: "Retornos Mensais" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 border-r border-slate-800 bg-surface/80 px-4 py-6 md:block">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent-soft text-sm font-semibold text-white">
          FF
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">FinanceFlow</p>
          <p className="text-xs text-slate-400">Passive Income</p>
        </div>
      </div>

      <nav className="space-y-1 text-sm">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 transition ${
                active
                  ? "bg-accent-soft/90 text-slate-50"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-50"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
