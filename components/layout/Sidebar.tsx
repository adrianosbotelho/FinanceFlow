 "use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/insights", label: "Insights Financeiros" },
  { href: "/performance", label: "Performance" },
  { href: "/goals", label: "Metas" },
  { href: "/investments", label: "Investimentos" },
  { href: "/returns", label: "Retornos Mensais" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("financeflow.sidebar.collapsed");
    if (saved === "1") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(
        "financeflow.sidebar.collapsed",
        next ? "1" : "0",
      );
      return next;
    });
  };

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 border-r border-slate-800 bg-surface/80 px-3 py-4 md:block ${
        collapsed ? "w-20" : "w-60"
      }`}
    >
      <div className={`mb-6 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
        <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent-soft text-sm font-semibold text-white">
            FF
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold text-slate-100">FinanceFlow</p>
              <p className="text-xs text-slate-400">Passive Income</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
            aria-label="Recolher menu lateral"
            title="Recolher"
          >
            {"<"}
          </button>
        )}
        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mt-2 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
            aria-label="Expandir menu lateral"
            title="Expandir"
          >
            {">"}
          </button>
        )}
      </div>

      <nav className="space-y-1 text-sm">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center rounded-lg px-3 py-2 transition ${
                collapsed ? "justify-center" : "gap-2"
              } ${
                active
                  ? "bg-accent-soft/90 text-slate-50"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-50"
              }`}
            >
              <span className={`inline-flex h-2 w-2 rounded-full ${active ? "bg-white" : "bg-slate-500"}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
